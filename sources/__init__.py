"""One module per data source. Each adapter exposes:

    SOURCE_ID              short string stored in every event's "source" field
    load() -> list[dict]   download + normalize to the common event schema
    enrich(events, cache_path) -> list[dict]   optional extra details

To add a source: create sources/<name>.py with those functions and add it to
ADAPTERS below. Nothing else in the pipeline needs to change.
"""
from . import ville_montreal

ADAPTERS = [ville_montreal]
