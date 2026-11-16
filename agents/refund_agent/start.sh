#!/bin/sh
# Generated for Microsoft Foundry by the Ballerina extension and rewritten on each build. Delete this line to keep your edits.

ca="${NODE_EXTRA_CA_CERTS:-}"
if [ -n "$ca" ] && [ -f "$ca" ]; then
    work="$(mktemp -d)"
    store="$work/cacerts"
    cp "$JAVA_HOME/lib/security/cacerts" "$store"
    # keytool imports one certificate per file, so split the bundle first.
    csplit -s -z -f "$work/ca-" "$ca" '/-----BEGIN CERTIFICATE-----/' '{*}'
    for cert in "$work"/ca-*; do
        keytool -importcert -noprompt -keystore "$store" -storepass changeit \
            -alias "foundry-egress-$(basename "$cert")" -file "$cert" > /dev/null 2>&1
    done
    export JAVA_TOOL_OPTIONS="${JAVA_TOOL_OPTIONS:-} -Djavax.net.ssl.trustStore=$store -Djavax.net.ssl.trustStorePassword=changeit"
    echo "Trusting the Foundry egress proxy CA from $ca" >&2
fi

if [ -n "$APPLICATIONINSIGHTS_CONNECTION_STRING" ]; then
    /app/otelcol --config=/app/collector.yaml &
else
    echo "APPLICATIONINSIGHTS_CONNECTION_STRING not set; traces will not be exported" >&2
fi
exec java -jar /app/refund_agent.jar
