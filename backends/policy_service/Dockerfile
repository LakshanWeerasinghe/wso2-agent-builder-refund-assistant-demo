# Runs the service built by `bal build` (target/bin/policy_service.jar) on port 8090.
# Build the image for linux/amd64, which Azure Container Apps runs:
#   bal build
#   docker build --platform linux/amd64 -t policy-service:v1 .
# No configuration is copied into the image: pass it as BAL_CONFIG_VAR_<NAME> environment variables.
FROM eclipse-temurin:25-jre

RUN useradd --system --create-home --uid 10001 ballerina
WORKDIR /home/ballerina
COPY --chown=ballerina target/bin/policy_service.jar app.jar
USER 10001

# The policy register, PDFs and index state live on a mounted volume (an Azure Files share in Azure).
ENV BAL_CONFIG_VAR_POLICIESDIR=/mnt/policies
EXPOSE 8090
ENTRYPOINT ["java", "-jar", "app.jar"]
