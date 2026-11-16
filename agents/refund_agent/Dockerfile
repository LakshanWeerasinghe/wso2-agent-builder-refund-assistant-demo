# Generated for Microsoft Foundry by the Ballerina extension and rewritten on each build. Delete this line to keep your edits.
FROM --platform=$BUILDPLATFORM golang:1.26.2 AS otelcol
ARG TARGETOS TARGETARCH
RUN go install go.opentelemetry.io/collector/cmd/builder@v0.164.0
COPY otel/builder-config.yaml /src/builder-config.yaml
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH builder --config=/src/builder-config.yaml

FROM eclipse-temurin:25-jre

WORKDIR /app
COPY --from=otelcol /build/otelcol /app/otelcol
COPY otel/collector.yaml /app/collector.yaml
COPY otel/tracing.toml /app/tracing.toml
COPY start.sh /app/start.sh
COPY target/bin/refund_agent.jar /app/refund_agent.jar

ENV BAL_CONFIG_FILES=/app/tracing.toml
EXPOSE 8088

ENTRYPOINT ["/bin/sh", "/app/start.sh"]
