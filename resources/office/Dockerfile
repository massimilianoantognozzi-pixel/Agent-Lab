FROM debian:trixie-slim@sha256:a72b4433de1cf7d6bae0c4cee74d0547f58601a643b3375f070c51600d63b6b2
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    libreoffice-writer libreoffice-calc fonts-dejavu-core fonts-liberation \
    poppler-utils python3-docx python3-openpyxl python3-reportlab python3-pypdf python3-pil \
    && rm -rf /var/lib/apt/lists/*
ENV HOME=/tmp LANG=C.UTF-8 PYTHONDONTWRITEBYTECODE=1
USER 65534:65534
