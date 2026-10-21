# Compile and publish the worker
FROM mcr.microsoft.com/dotnet/sdk:10.0-noble AS build

WORKDIR /src

COPY SimLab.Worker.csproj ./
RUN dotnet restore SimLab.Worker.csproj

COPY . .

RUN dotnet publish SimLab.Worker.csproj \
    --configuration Release \
    --output /out \
    --no-restore \
    -p:UseAppHost=false

# Application runtime
FROM mcr.microsoft.com/dotnet/runtime:10.0-noble AS runtime

WORKDIR /app

COPY --from=build /out ./

USER app

ENTRYPOINT ["dotnet", "SimLab.Worker.dll"]

# Local development: add Azure CLI
FROM runtime AS local

USER root

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && curl -fsSL \
       'https://azurecliprod.blob.core.windows.net/$root/deb_install.sh' \
       -o /tmp/install-azure-cli.sh \
    && bash /tmp/install-azure-cli.sh \
    && rm /tmp/install-azure-cli.sh \
    && rm -rf /var/lib/apt/lists/*

USER app

# Default build for deployment
FROM runtime AS production