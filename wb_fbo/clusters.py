"""Mapping from WB region/warehouse names to Das Experten's 4 supply clusters.

Source: user-defined clustering:
  Восточный      — СФО + УФО + ДФО
  Центральный    — ЦФО + ПФО
  Южный          — ЮФО + СКФО
  Северо-западный — СЗФО

WB stocks API returns a `region` field per row. We normalise to lowercase
and look up the cluster. If the region is not recognised we fall back to
the warehouse name lookup, then to "Прочие".
"""

CLUSTER_EAST = "Восточный"
CLUSTER_CENTRAL = "Центральный"
CLUSTER_SOUTH = "Южный"
CLUSTER_NW = "Северо-западный"
CLUSTER_OTHER = "Прочие"

# WB `region` field values → cluster  (lower-cased keys)
_REGION_MAP: dict[str, str] = {
    # Уральский ФО → Восточный
    "урал": CLUSTER_EAST,
    "уральский": CLUSTER_EAST,
    "урфо": CLUSTER_EAST,
    # Сибирский ФО → Восточный
    "сибирь": CLUSTER_EAST,
    "сибирский": CLUSTER_EAST,
    "западная сибирь": CLUSTER_EAST,
    "восточная сибирь": CLUSTER_EAST,
    "сфо": CLUSTER_EAST,
    # Дальневосточный ФО → Восточный
    "восток": CLUSTER_EAST,
    "дальний восток": CLUSTER_EAST,
    "дальневосточный": CLUSTER_EAST,
    "двфо": CLUSTER_EAST,
    "дфо": CLUSTER_EAST,
    # Казахстан → Восточный
    "казахстан": CLUSTER_EAST,
    "kazakhstan": CLUSTER_EAST,
    "kz": CLUSTER_EAST,
    # Центральный ФО → Центральный
    "центр": CLUSTER_CENTRAL,
    "центральный": CLUSTER_CENTRAL,
    "цфо": CLUSTER_CENTRAL,
    # Приволжский ФО → Центральный
    "поволжье": CLUSTER_CENTRAL,
    "приволжский": CLUSTER_CENTRAL,
    "пфо": CLUSTER_CENTRAL,
    # Южный ФО → Южный
    "юг": CLUSTER_SOUTH,
    "южный": CLUSTER_SOUTH,
    "юфо": CLUSTER_SOUTH,
    # Северо-Кавказский ФО → Южный
    "северный кавказ": CLUSTER_SOUTH,
    "северо-кавказский": CLUSTER_SOUTH,
    "скфо": CLUSTER_SOUTH,
    # Северо-Западный ФО → Северо-западный
    "северо-запад": CLUSTER_NW,
    "северо-западный": CLUSTER_NW,
    "сзфо": CLUSTER_NW,
}

# Fallback: WB warehouse name substrings → cluster  (lower-cased keys)
_WAREHOUSE_HINTS: list[tuple[str, str]] = [
    # Восточный
    ("казахстан", CLUSTER_EAST),
    ("астана", CLUSTER_EAST),
    ("алматы", CLUSTER_EAST),
    ("екатеринбург", CLUSTER_EAST),
    ("тюмень", CLUSTER_EAST),
    ("челябинск", CLUSTER_EAST),
    ("новосибирск", CLUSTER_EAST),
    ("омск", CLUSTER_EAST),
    ("красноярск", CLUSTER_EAST),
    ("иркутск", CLUSTER_EAST),
    ("хабаровск", CLUSTER_EAST),
    ("владивосток", CLUSTER_EAST),
    ("сибирь", CLUSTER_EAST),
    # Центральный
    ("москва", CLUSTER_CENTRAL),
    ("коледино", CLUSTER_CENTRAL),
    ("электросталь", CLUSTER_CENTRAL),
    ("тула", CLUSTER_CENTRAL),
    ("подольск", CLUSTER_CENTRAL),
    ("казань", CLUSTER_CENTRAL),
    ("нижний новгород", CLUSTER_CENTRAL),
    ("самара", CLUSTER_CENTRAL),
    ("уфа", CLUSTER_CENTRAL),
    ("пермь", CLUSTER_CENTRAL),
    # Южный
    ("краснодар", CLUSTER_SOUTH),
    ("ростов", CLUSTER_SOUTH),
    ("астрахань", CLUSTER_SOUTH),
    ("ставрополь", CLUSTER_SOUTH),
    # Северо-западный
    ("санкт-петербург", CLUSTER_NW),
    ("спб", CLUSTER_NW),
    ("питер", CLUSTER_NW),
    ("мурманск", CLUSTER_NW),
    ("архангельск", CLUSTER_NW),
    ("вологда", CLUSTER_NW),
    ("калининград", CLUSTER_NW),
]


def region_to_cluster(region: str | None, warehouse_name: str | None = None) -> str:
    """Return one of the 4 cluster names, or CLUSTER_OTHER if unrecognised."""
    if region:
        key = region.strip().lower()
        if key in _REGION_MAP:
            return _REGION_MAP[key]

    if warehouse_name:
        wh = warehouse_name.strip().lower()
        for hint, cluster in _WAREHOUSE_HINTS:
            if hint in wh:
                return cluster

    return CLUSTER_OTHER


ALL_CLUSTERS = [CLUSTER_CENTRAL, CLUSTER_SOUTH, CLUSTER_NW, CLUSTER_EAST, CLUSTER_OTHER]
