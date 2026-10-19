using System.Net;
using System.Text.Json;
using Azure.Identity;
using Azure.Messaging.ServiceBus;
using Microsoft.Azure.Cosmos;

namespace SimLab.Worker;

public sealed class Worker(
    IConfiguration configuration,
    ILogger<Worker> logger) : BackgroundService
{
    private static readonly JsonSerializerOptions JsonOptions =
        new(JsonSerializerDefaults.Web);

    protected override async Task ExecuteAsync(
        CancellationToken stoppingToken)
    {
        var credential = new DefaultAzureCredential();

        using var cosmos = new CosmosClient(
            Required("COSMOS_ENDPOINT"),
            credential,
            new CosmosClientOptions
            {
                ConnectionMode = ConnectionMode.Gateway,
            });

        var runs = cosmos.GetContainer(
            Required("COSMOS_DATABASE"),
            "runs");

        await using var bus = new ServiceBusClient(
            Required("SERVICE_BUS_NAMESPACE"),
            credential);

        var queueName = Required("SERVICE_BUS_QUEUE");

        await using var processor = bus.CreateProcessor(
            queueName,
            new ServiceBusProcessorOptions
            {
                ReceiveMode = ServiceBusReceiveMode.PeekLock,
                AutoCompleteMessages = false,
                MaxConcurrentCalls = 1,
            });

        processor.ProcessMessageAsync +=
            args => ProcessRunAsync(args, runs);

        processor.ProcessErrorAsync += args =>
        {
            logger.LogError(
                args.Exception,
                "Service Bus error during {Source}",
                args.ErrorSource);

            return Task.CompletedTask;
        };

        await processor.StartProcessingAsync(stoppingToken);

        logger.LogInformation(
            "Listening on {Queue}",
            queueName);

        try
        {
            await Task.Delay(Timeout.Infinite, stoppingToken);
        }
        catch (OperationCanceledException)
            when (stoppingToken.IsCancellationRequested)
        {
            // Normal shutdown, for example Ctrl+C.
        }
        finally
        {
            await processor.StopProcessingAsync(
                CancellationToken.None);
        }
    }

    private async Task ProcessRunAsync(
        ProcessMessageEventArgs args,
        Container runs)
    {
        RunMessage? run;

        try
        {
            run = JsonSerializer.Deserialize<RunMessage>(
                args.Message.Body.ToString(),
                JsonOptions);
        }
        catch (JsonException)
        {
            await args.DeadLetterMessageAsync(
                args.Message,
                deadLetterReason: "InvalidMessage",
                deadLetterErrorDescription:
                    "Message body must be valid run JSON.",
                cancellationToken: args.CancellationToken);

            return;
        }

        if (run is null ||
            run.SchemaVersion != 1 ||
            !Guid.TryParse(run.JobId, out _) ||
            run.RunNumber is < 1 or > 100 ||
            run.RunId != $"{run.JobId}:{run.RunNumber}")
        {
            await args.DeadLetterMessageAsync(
                args.Message,
                deadLetterReason: "InvalidMessage",
                deadLetterErrorDescription:
                    "Invalid schema version or run identifiers.",
                cancellationToken: args.CancellationToken);

            return;
        }

        // Start with a simple, repeatable calculation.
        var result = run.RunNumber * run.RunNumber;

        try
        {
            await runs.CreateItemAsync(
                new
                {
                    id = run.RunId,
                    jobId = run.JobId,
                    runNumber = run.RunNumber,
                    result,
                    status = "completed",
                    completedAt = DateTimeOffset.UtcNow,
                },
                new PartitionKey(run.JobId),
                cancellationToken: args.CancellationToken);
        }
        catch (CosmosException ex)
            when (ex.StatusCode == HttpStatusCode.Conflict)
        {
            // A previous delivery already saved this run.
            logger.LogInformation(
                "Result already exists for {RunId}",
                run.RunId);
        }

        // Acknowledge only after the result exists in Cosmos DB.
        await args.CompleteMessageAsync(
            args.Message,
            args.CancellationToken);

        logger.LogInformation(
            "Completed {RunId}: result {Result}",
            run.RunId,
            result);
    }

    private string Required(string name) =>
        configuration[name] is { Length: > 0 } value
            ? value
            : throw new InvalidOperationException(
                $"Missing configuration: {name}");

    private sealed record RunMessage(
        int SchemaVersion,
        string JobId,
        string RunId,
        int RunNumber);
}