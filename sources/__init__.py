"""One module per data source. Each adapter exposes:

    SOURCE_ID              short string stored in every event's "source" field
    load(cache_dir) -> list[dict]   download + normalize to the common event schema
                           (cache_dir: a folder the adapter may use for its own cache)
    enrich(events, cache_path) -> list[dict]   optional extra details

To add a source: create sources/<name>.py with those functions and add it to
ADAPTERS below. Nothing else in the pipeline needs to change.
"""
from . import concordia, loisirs_montreal, ville_montreal

ADAPTERS = [ville_montreal, loisirs_montreal, concordia]
