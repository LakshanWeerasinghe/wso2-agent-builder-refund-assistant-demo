"""Builds deployment.svg: the ReverieEscapes refund assistant deployed on Microsoft Azure.

The output is one self-contained SVG (icons are inlined as <symbol>s), so it renders on GitHub.
Run: python3 build_diagram.py
"""
import pathlib
import re
from xml.sax.saxutils import escape

HERE = pathlib.Path(__file__).parent
ICONS = HERE / "icons"

W, H = 1800, 1100

INK = "#1b2236"
MUTED = "#5f6675"
AZURE = "#0078d4"
GOLD = "#a5824c"
FOUNDRY = "#6a3fb5"
REQUEST = "#1b2236"      # request path, numbered steps
INGEST = "#0f7b6c"       # policy ingestion, lettered steps
MOCK = "#8a93a6"         # mocked integration
FONT = "Segoe UI, Inter, Helvetica Neue, Arial, sans-serif"

out = []
symbols = []


def symbol(name):
    """Registers icons/<name>.svg as <symbol id="ic-<name>">."""
    text = (ICONS / f"{name}.svg").read_text(encoding="utf-8")
    text = re.sub(r"<\?xml.*?\?>|<!DOCTYPE.*?>|<!--.*?-->", "", text, flags=re.S)
    root = re.search(r"<svg\b([^>]*)>(.*)</svg>", text, flags=re.S)
    attrs, body = root.group(1), root.group(2)
    vb = re.search(r'viewBox="([^"]+)"', attrs)
    if vb:
        view_box = vb.group(1)
    else:
        w = float(re.search(r'width="([\d.]+)', attrs).group(1))
        h = float(re.search(r'height="([\d.]+)', attrs).group(1))
        view_box = f"0 0 {w} {h}"
    symbols.append(f'<symbol id="ic-{name}" viewBox="{view_box}">{body}</symbol>')


for icon in ["users", "storage-account", "container-apps-environment", "container-app", "foundry",
             "foundry-agent-service", "content-safety", "azure-openai", "ai-search", "azure-files",
             "container-registry", "key-vault", "log-analytics", "application-insights", "subscription",
             "resource-group", "on-premises", "wso2"]:
    symbol(icon)


def use(name, x, y, w, h):
    out.append(f'<use href="#ic-{name}" x="{x}" y="{y}" width="{w}" height="{h}"/>')


def text(x, y, s, size=13, weight=400, color=INK, anchor="start", italic=False):
    style = ' font-style="italic"' if italic else ""
    out.append(f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{weight}" fill="{color}" '
               f'text-anchor="{anchor}"{style}>{escape(s)}</text>')


def boundary(x, y, w, h, label, icon=None, stroke=MUTED, dash="7 5", fill="none", label_color=INK,
             label_pos="top", radius=10):
    out.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{radius}" fill="{fill}" stroke="{stroke}" '
               f'stroke-width="1.4" stroke-dasharray="{dash}"/>')
    if not label:
        return
    ly = y + 10 if label_pos == "top" else y + h - 34
    tx = x + 14
    if icon:
        use(icon, x + 12, ly, 22, 22)
        tx = x + 42
    text(tx, ly + 17, label, size=14, weight=650, color=label_color)


def card(x, y, w, h, icon, title, lines, wso2=False, accent=AZURE, planned=False):
    dash = ' stroke-dasharray="5 4"' if planned else ""
    out.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8" fill="#ffffff" stroke="#b9c1cf" '
               f'stroke-width="1.1"{dash}/>')
    out.append(f'<rect x="{x}" y="{y}" width="4" height="{h}" rx="2" fill="{accent}"/>')
    use(icon, x + 16, y + 18, 40, 40)
    text(x + 68, y + 34, title, size=15, weight=650)
    for i, line in enumerate(lines):
        text(x + 68, y + 55 + i * 17, line, size=12, color=MUTED)
    if wso2:
        use("wso2", x + w - 64, y + h - 24, 54, 14)
    if planned:
        out.append(f'<rect x="{x + w - 66}" y="{y + h - 27}" width="56" height="18" rx="9" fill="#f4eefc" '
                   f'stroke="{FOUNDRY}" stroke-width=".8"/>')
        text(x + w - 38, y + h - 14, "planned", size=10.5, weight=600, color=FOUNDRY, anchor="middle")


def arrow(points, color=REQUEST, dashed=False, width=1.8):
    d = "M" + " L".join(f"{px},{py}" for px, py in points)
    dash = ' stroke-dasharray="6 4"' if dashed else ""
    marker = {REQUEST: "arrow-req", INGEST: "arrow-ing", MOCK: "arrow-mock"}[color]
    out.append(f'<path d="{d}" fill="none" stroke="#ffffff" stroke-width="7" stroke-linejoin="round"/>')
    out.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{width}" stroke-linejoin="round"{dash} '
               f'marker-end="url(#{marker})"/>')


def tag(x, y, s, color=REQUEST):
    """Small edge label on a white pill, centred on (x, y)."""
    width = len(s) * 6.4 + 14
    out.append(f'<rect x="{x - width / 2}" y="{y - 13}" width="{width}" height="19" rx="9.5" fill="#ffffff" '
               f'stroke="{color}" stroke-opacity=".35"/>')
    text(x, y + 1, s, size=11.5, color=color, anchor="middle")


def step(x, y, label, color=REQUEST):
    out.append(f'<circle cx="{x}" cy="{y}" r="11" fill="{color}" stroke="#ffffff" stroke-width="2"/>')
    text(x, y + 4.5, label, size=12, weight=700, color="#ffffff", anchor="middle")


# ---------------------------------------------------------------- title
text(24, 42, "ReverieEscapes refund assistant on Microsoft Azure", size=23, weight=650)
text(24, 66, "WSO2 Integrator services and a Microsoft Foundry hosted agent, with Azure OpenAI, Foundry guardrails "
             "and Azure AI Search over multilingual policy PDFs", size=13.5, color=MUTED)

# ---------------------------------------------------------------- outside Azure
boundary(20, 100, 210, 240, "Users")
use("users", 40, 150, 44, 44)
text(94, 182, "Customer", size=13, weight=600)
text(94, 199, "representatives", size=13, weight=600)
use("users", 40, 238, 44, 44)
text(94, 256, "Guests", size=13, weight=600)
text(94, 273, "resolution link", size=12, color=MUTED)

boundary(20, 368, 210, 222, "Enterprise systems")
use("on-premises", 34, 404, 30, 30)
text(72, 424, "mock data in this demo", size=11.5, color=MUTED, italic=True)
for i, s in enumerate(["Property management", "Reverie Circle loyalty", "Payments"]):
    out.append(f'<rect x="34" y="{448 + i * 44}" width="182" height="34" rx="6" fill="#f4f1ea" stroke="#d8cfbd"/>')
    text(46, 470 + i * 44, s, size=12.5)

# ---------------------------------------------------------------- Azure
boundary(250, 92, 1530, 992, "Azure subscription", icon="subscription", stroke=AZURE, dash="0", label_color=AZURE,
         fill="#fbfcfe", radius=12)
boundary(266, 132, 1498, 936, "Resource group  rg-reverie-refunds", icon="resource-group")

# Tier 1: portal
card(690, 150, 290, 100, "storage-account", "Support portal", ["Storage static website", "rep portal · guest page"])

# Tier 2: Container Apps environment
boundary(290, 330, 1150, 230, "Container Apps environment", icon="container-apps-environment", stroke=AZURE,
         label_color=AZURE)
card(320, 380, 260, 130, "container-app", "Guest MCP server",
     ["reservations, incidents,", "loyalty: MCP tools + REST"], wso2=True, accent=GOLD)
card(720, 380, 260, 130, "container-app", "Refund API",
     ["cases, approvals, refund,", "guest links, PDF proxy"], wso2=True, accent=GOLD)
card(1120, 380, 260, 130, "container-app", "Policy service",
     ["policy register, PDFs,", "clause-aware ingestion"], wso2=True, accent=GOLD)
card(1480, 380, 260, 110, "azure-files", "Policy store", ["Azure Files share", "PDFs + register"])

# Tier 3: Foundry project and AI Search
boundary(690, 640, 890, 250, "Microsoft Foundry project", icon="foundry", stroke=FOUNDRY, label_color="#4b2b86",
         label_pos="bottom")
card(720, 690, 240, 130, "foundry-agent-service", "Refund agent",
     ["Foundry hosted agent", "Ballerina ai:Agent"], wso2=True, accent=GOLD)
card(1010, 690, 210, 130, "content-safety", "Guardrails",
     ["content filters,", "prompt shields"], accent=FOUNDRY)
card(1270, 690, 280, 130, "azure-openai", "Azure OpenAI",
     ["chat model deployment", "embedding deployment"])
card(320, 690, 260, 130, "ai-search", "Azure AI Search",
     ["index reverie-policies", "hybrid vector + keyword,", "scope + date filters"])

# Tier 4: shared platform services
boundary(290, 946, 1450, 106, "", stroke="#b9c1cf")
text(306, 970, "Shared platform services", size=13, weight=650, color=MUTED)
tiles = [("container-registry", "Container Registry", "images for apps and agent"),
         ("key-vault", "Key Vault", "API keys as app secrets"),
         ("log-analytics", "Log Analytics", "container logs"),
         ("application-insights", "Application Insights", "agent traces, telemetry")]
for i, (icon, title, sub) in enumerate(tiles):
    tx = 306 + i * 356
    use(icon, tx, 982, 38, 38)
    text(tx + 48, 998, title, size=13, weight=600)
    text(tx + 48, 1016, sub, size=11.5, color=MUTED)

# ---------------------------------------------------------------- request path (numbered)
arrow([(230, 195), (690, 195)])                                   # reps -> portal
step(460, 195, "1")
arrow([(230, 270), (740, 270), (740, 250)])                       # guests -> portal
arrow([(850, 250), (850, 380)])                                   # portal -> refund API
step(850, 300, "2")
arrow([(850, 510), (850, 690)])                                   # refund API -> agent
step(850, 600, "3")
arrow([(760, 690), (760, 595), (450, 595), (450, 510)])           # agent -> guest MCP
step(605, 595, "4")
arrow([(920, 690), (920, 615), (1160, 615), (1160, 510)])         # agent -> policy service
step(1040, 615, "5")
arrow([(720, 755), (580, 755)])                                   # agent -> AI Search
step(650, 755, "6")
arrow([(960, 755), (1010, 755)])                                  # agent -> guardrails
arrow([(1220, 755), (1270, 755)])                                 # guardrails -> model
step(985, 755, "7")
arrow([(980, 445), (1120, 445)])                                  # refund API -> policy service
tag(1050, 434, "PDFs")
arrow([(320, 445), (230, 445)], color=MOCK, dashed=True)          # MCP -> enterprise systems

# ---------------------------------------------------------------- ingestion path (lettered)
arrow([(980, 200), (1250, 200), (1250, 380)], color=INGEST)       # portal -> policy service (upload)
step(1250, 290, "A", INGEST)
arrow([(1380, 430), (1480, 430)], color=INGEST)                   # policy service -> Azure Files
arrow([(1340, 510), (1340, 690)], color=INGEST)                   # policy service -> embeddings
step(1340, 600, "B", INGEST)
arrow([(1370, 510), (1370, 545), (1610, 545), (1610, 915), (450, 915), (450, 820)], color=INGEST)
step(1030, 915, "C", INGEST)

# ---------------------------------------------------------------- legend
lx, ly = 20, 620
boundary(lx, ly, 210, 390, "Legend")
for row, (label, color, marker, name) in enumerate([("1", REQUEST, "arrow-req", "request path, 1–7"),
                                                   ("A", INGEST, "arrow-ing", "policy ingestion, A–C")]):
    y = ly + 60 + row * 44
    out.append(f'<path d="M{lx + 14},{y} L{lx + 62},{y}" stroke="{color}" stroke-width="1.8" '
               f'marker-end="url(#{marker})"/>')
    step(lx + 32, y, label, color)
    text(lx + 72, y + 4, name, size=12, color=color)
out.append(f'<path d="M{lx + 14},{ly + 148} L{lx + 62},{ly + 148}" stroke="{MOCK}" stroke-width="1.8" '
           f'stroke-dasharray="6 4" marker-end="url(#arrow-mock)"/>')
text(lx + 72, ly + 152, "mocked integration", size=12)
out.append(f'<rect x="{lx + 14}" y="{ly + 180}" width="28" height="20" rx="3" fill="#fff" stroke="#b9c1cf"/>')
out.append(f'<rect x="{lx + 14}" y="{ly + 180}" width="4" height="20" fill="{GOLD}"/>')
text(lx + 50, ly + 195, "code in this repo", size=12)
out.append(f'<rect x="{lx + 14}" y="{ly + 212}" width="28" height="20" rx="3" fill="#fff" stroke="#b9c1cf"/>')
out.append(f'<rect x="{lx + 14}" y="{ly + 212}" width="4" height="20" fill="{AZURE}"/>')
text(lx + 50, ly + 227, "Azure managed service", size=12)
out.append(f'<rect x="{lx + 14}" y="{ly + 244}" width="28" height="20" rx="3" fill="none" stroke="{MUTED}" '
           f'stroke-dasharray="5 4"/>')
text(lx + 50, ly + 259, "deployment boundary", size=12)
use("wso2", lx + 14, ly + 284, 64, 16)
text(lx + 86, ly + 297, "WSO2 Integrator", size=12)
text(lx + 86, ly + 313, "(Ballerina)", size=12, color=MUTED)
text(lx + 14, ly + 352, "Azure icons © Microsoft,", size=10.5, color=MUTED)
text(lx + 14, ly + 367, "used per its diagram terms", size=10.5, color=MUTED)

svg = (f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="{W}" '
       f'height="{H}" viewBox="0 0 {W} {H}" font-family="{FONT}">'
       '<defs>'
       + "".join(f'<marker id="{mid}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" '
                 f'orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="{col}"/></marker>'
                 for mid, col in [("arrow-req", REQUEST), ("arrow-ing", INGEST), ("arrow-mock", MOCK)])
       + "".join(symbols) +
       '</defs>'
       f'<rect width="{W}" height="{H}" fill="#ffffff"/>'
       + "".join(out) + '</svg>')
(HERE / "deployment.svg").write_text(svg, encoding="utf-8")
print(f"Wrote {HERE / 'deployment.svg'} ({len(svg) // 1024} KB)")
