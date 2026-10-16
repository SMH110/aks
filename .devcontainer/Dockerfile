FROM mcr.microsoft.com/devcontainers/dotnet:1-8.0-bookworm

# Remove the unused Yarn package repository.
RUN rm -f /etc/apt/sources.list.d/yarn.list \
          /etc/apt/sources.list.d/yarn.sources

COPY mssql/installSQLtools.sh installSQLtools.sh

RUN bash ./installSQLtools.sh \
    && apt-get clean -y \
    && rm -rf /var/lib/apt/lists/* /tmp/library-scripts