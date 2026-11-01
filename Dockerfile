FROM python:3.12-slim

ARG UID=1000
ARG GID=1000
RUN groupadd -g "$GID" gym && useradd -u "$UID" -g "$GID" -M -s /usr/sbin/nologin gym

WORKDIR /app
COPY sudoku_core.py db.py analysis.py drills.py hints.py rating.py server.py i18n.py docker-entrypoint.sh ./
COPY tools/import_bank.py tools/
COPY web/ web/
COPY theory/ theory/
RUN chmod +x docker-entrypoint.sh && mkdir -p data && chown gym:gym data

USER gym
ENV PYTHONUNBUFFERED=1
EXPOSE 8765
HEALTHCHECK --interval=30s --timeout=3s CMD python3 -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8765/api/health')"
ENTRYPOINT ["./docker-entrypoint.sh"]
