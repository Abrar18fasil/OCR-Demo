# Arabic OCR Demo

Static GitHub Pages demo for reviewing Arabic OCR output.

This repo contains only the browser demo and exported sample OCR data. It does not include the private Python OCR pipeline or run OCR live.

## Local Preview

```bash
cd /Users/abrarfaisal/Documents/work/OCR-Demo/docs
python3 -m http.server 8080
```

Open:

```text
http://127.0.0.1:8080
```

## GitHub Pages Setup

In GitHub:

1. Open this repository.
2. Go to `Settings`.
3. Go to `Pages`.
4. Set `Source` to `Deploy from a branch`.
5. Set branch to `main`.
6. Set folder to `/docs`.
7. Save.

The live site will appear at:

```text
https://abrar18fasil.github.io/OCR-Demo/
```

## Updating Demo Data

From the private OCR prototype repo:

```bash
./scripts/export_static_demo.py
```

Then copy the updated static files into this repo's `docs/` folder, commit, and push.
