# Runs the service built by `bal build` (target/bin/guest_mcp_server.jar) on port 9090.
# Build the image for linux/amd64, which Azure Container Apps runs:
#   bal build
#   docker build --platform linux/amd64 -t guest-mcp-server:v1 .
# No configuration is copied into the image: pass it as BAL_CONFIG_VAR_<NAME> environment variables.
FROM eclipse-temurin:25-jre

RUN useradd --system --create-home --uid 10001 ballerina
WORKDIR /home/ballerina
COPY --chown=ballerina target/bin/guest_mcp_server.jar app.jar
USER 10001

EXPOSE 9090
ENTRYPOINT ["java", "-jar", "app.jar"]
