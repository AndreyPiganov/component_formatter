"""Build the handoff archive and verify catalog vectors against the Figma export."""
from collections import defaultdict
from hashlib import sha256
from pathlib import Path
from tempfile import TemporaryDirectory
from xml.etree import ElementTree
from zipfile import ZIP_DEFLATED, ZipFile
import json

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"


def signature(node):
    return (node.tag, tuple(sorted(node.attrib.items())), (node.text or "").strip(),
            tuple(signature(child) for child in node))


def main():
    sheet = ASSETS / ".source" / "figma-sheet.svg"
    children = list(ElementTree.parse(sheet).getroot())
    indices = defaultdict(list)
    for i, node in enumerate(children):
        indices[signature(node)].append(i)

    manifest = ASSETS / "catalog.json"
    files = [manifest, sheet]
    matches = []
    for entry in json.loads(manifest.read_text()):
        file = (ASSETS / entry["file"]).resolve()
        file.relative_to((ASSETS / "library").resolve())
        files.append(file)
        positions = []
        for node in ElementTree.parse(file).getroot():
            candidates = indices[signature(node)]
            index = next((i for i in candidates if not positions or i > positions[-1]), None)
            if index is None:
                raise ValueError(f"Unmatched source element in {file.name}")
            positions.append(index)
        matches.append(dict(file=entry["file"], viewBox=ElementTree.parse(file).getroot().get("viewBox"),
                            sheetChildIndices=positions))

    for name in ["study-and-ideas.svg", "music-and-puzzles.svg", "digital-wallet.svg", "editor.png"]:
        files.append(ASSETS / "demo" / name)
    target = ASSETS / "component-formatter-assets.zip"
    with TemporaryDirectory(dir=ASSETS) as temp:
        archive = Path(temp) / target.name
        with ZipFile(archive, "w", ZIP_DEFLATED) as out:
            for file in files:
                out.write(file, file.relative_to(ROOT))
            evidence = dict(sheet="assets/.source/figma-sheet.svg", sha256=sha256(sheet.read_bytes()).hexdigest(),
                            indexBase=0, variants=matches)
            out.writestr("assets/provenance.json", json.dumps(evidence, ensure_ascii=False, indent=2))
        with ZipFile(archive) as check:
            if check.testzip():
                raise ValueError("Invalid archive")
        archive.replace(target)
    print(f"{len(matches)} variants verified; archive written to {target}")


if __name__ == "__main__":
    main()
