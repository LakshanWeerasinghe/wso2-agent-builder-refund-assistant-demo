# Runs the service built by `bal build` (target/bin/refund_api.jar) on port 8080.
# Build the image for linux/amd64, which Azure Container Apps runs:
#   bal build
#   docker build --platform linux/amd64 -t refund-api:v1 .
# No configuration is copied into the image: pass it as BAL_CONFIG_VAR_<NAME> environment variables.
FROM eclipse-temurin:25-jre

RUN useradd --system --create-home --uid 10001 ballerina
WORKDIR /home/ballerina
COPY --chown=ballerina target/bin/refund_api.jar app.jar
USER 10001

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
