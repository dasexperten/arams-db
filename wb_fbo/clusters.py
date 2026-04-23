"""Mapping from WB region/warehouse names to Das Experten's 4 supply clusters.

Source: user-defined clustering:
  Восточный      — СФО + УФО + ДФО + Казахстан
  Центральный    — ЦФО + ПФО
  Южный          — ЮФО + СКФО
  Северо-западный — СЗФО

Primary lookup: CLUSTER_MAP (exact warehouse names from WB API).
Fallback 1: region field substring matching (_REGION_MAP).
Fallback 2: warehouse name substring hints (_WAREHOUSE_HINTS).
Fallback 3: CLUSTER_OTHER ("Прочие").

CLUSTER_MAP warehouse names are preliminary — update after first real API run.
"""

CLUSTER_EAST = "Восточный"
CLUSTER_CENTRAL = "Центральный"
CLUSTER_VOLGA = "Волга"
CLUSTER_SOUTH = "Южный"
CLUSTER_NW = "Северо-западный"
CLUSTER_OTHER = "Прочие"
CLUSTER_UNKNOWN = "UNKNOWN"

# Exact warehouse name → cluster.  Update after first real API run to match actual names.
CLUSTER_MAP: dict[str, str] = {
    # Центральный (ЦФО)
    "Коледино": CLUSTER_CENTRAL,
    "Тула (Алексин)": CLUSTER_CENTRAL,
    "Рязань (Тюшевское)": CLUSTER_CENTRAL,
    # Волга (ПФО)
    "Казань": CLUSTER_VOLGA,
    "Самара (Новосемейкино)": CLUSTER_VOLGA,
    "Сарапул": CLUSTER_VOLGA,
    # Южный (ЮФО + СКФО)
    "Краснодар": CLUSTER_SOUTH,
    "Невинномысск": CLUSTER_SOUTH,
    "Волгоград": CLUSTER_SOUTH,
    # Северо-западный (СЗФО)
    "СПб Шушары": CLUSTER_NW,
    # Восточный (УрФО + СФО + ДФО + Казахстан)
    "Екатеринбург Перспективный 14": CLUSTER_EAST,
}

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
    # Приволжский ФО → Волга
    "поволжье": CLUSTER_VOLGA,
    "приволжский": CLUSTER_VOLGA,
    "пфо": CLUSTER_VOLGA,
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
    # Центральный (ЦФО) — Москва, МО и соседние регионы
    ("москва", CLUSTER_CENTRAL),
    ("московск", CLUSTER_CENTRAL),   # Московская, Московский
    ("коледино", CLUSTER_CENTRAL),
    ("электросталь", CLUSTER_CENTRAL),
    ("тула", CLUSTER_CENTRAL),
    ("подольск", CLUSTER_CENTRAL),
    ("рязань", CLUSTER_CENTRAL),
    # Подмосковные склады WB (часто без слова «Москва»)
    ("вёшки", CLUSTER_CENTRAL),
    ("веshki", CLUSTER_CENTRAL),
    ("пушкино", CLUSTER_CENTRAL),
    ("домодедово", CLUSTER_CENTRAL),
    ("хоругвино", CLUSTER_CENTRAL),
    ("обухово", CLUSTER_CENTRAL),
    ("белая дача", CLUSTER_CENTRAL),
    ("лобня", CLUSTER_CENTRAL),
    ("щёлково", CLUSTER_CENTRAL),
    ("щелково", CLUSTER_CENTRAL),
    ("чехов", CLUSTER_CENTRAL),
    ("дубровка", CLUSTER_CENTRAL),
    ("люберцы", CLUSTER_CENTRAL),
    ("холдино", CLUSTER_CENTRAL),
    ("солнечногорск", CLUSTER_CENTRAL),
    ("серпухов", CLUSTER_CENTRAL),
    ("ногинск", CLUSTER_CENTRAL),
    ("мытищи", CLUSTER_CENTRAL),
    ("балашиха", CLUSTER_CENTRAL),
    ("химки", CLUSTER_CENTRAL),
    ("красногорск", CLUSTER_CENTRAL),
    # Прочие ЦФО-регионы
    ("ярославль", CLUSTER_CENTRAL),
    ("иваново", CLUSTER_CENTRAL),
    ("владимир", CLUSTER_CENTRAL),
    ("тверь", CLUSTER_CENTRAL),
    ("воронеж", CLUSTER_CENTRAL),
    ("липецк", CLUSTER_CENTRAL),
    ("брянск", CLUSTER_CENTRAL),
    ("орёл", CLUSTER_CENTRAL),
    ("орел", CLUSTER_CENTRAL),
    ("курск", CLUSTER_CENTRAL),
    ("белгород", CLUSTER_CENTRAL),
    ("смоленск", CLUSTER_CENTRAL),
    ("калуга", CLUSTER_CENTRAL),
    ("кострома", CLUSTER_CENTRAL),
    ("тамбов", CLUSTER_CENTRAL),
    # Волга (ПФО)
    ("казань", CLUSTER_VOLGA),
    ("сарапул", CLUSTER_VOLGA),
    ("нижний новгород", CLUSTER_VOLGA),
    ("самара", CLUSTER_VOLGA),
    ("уфа", CLUSTER_VOLGA),
    ("пермь", CLUSTER_VOLGA),
    ("саратов", CLUSTER_VOLGA),
    ("ульяновск", CLUSTER_VOLGA),
    ("оренбург", CLUSTER_VOLGA),
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


def warehouse_to_cluster(warehouse_name: str | None, region: str | None = None) -> str:
    """Map a WB warehouse name to a supply cluster.

    Lookup order:
    1. Exact match in CLUSTER_MAP (primary — update names after first real run).
    2. Region field substring match (_REGION_MAP).
    3. Warehouse name substring hints (_WAREHOUSE_HINTS).
    4. CLUSTER_UNKNOWN — unknown warehouse, caller should flag it.
    """
    if warehouse_name:
        if warehouse_name in CLUSTER_MAP:
            return CLUSTER_MAP[warehouse_name]

    if region:
        key = region.strip().lower()
        if key in _REGION_MAP:
            return _REGION_MAP[key]

    if warehouse_name:
        wh = warehouse_name.strip().lower()
        for hint, cluster in _WAREHOUSE_HINTS:
            if hint in wh:
                return cluster

    return CLUSTER_UNKNOWN


# WB oblastOkrugName values → cluster  (lower-cased keys)
_OBLAST_OKRUG_MAP: dict[str, str] = {
    "центральный федеральный округ": CLUSTER_CENTRAL,
    "северо-западный федеральный округ": CLUSTER_NW,
    "южный федеральный округ": CLUSTER_SOUTH,
    "северо-кавказский федеральный округ": CLUSTER_SOUTH,
    "приволжский федеральный округ": CLUSTER_VOLGA,
    "уральский федеральный округ": CLUSTER_EAST,
    "сибирский федеральный округ": CLUSTER_EAST,
    "дальневосточный федеральный округ": CLUSTER_EAST,
    # Сокращения на случай если API вернёт их
    "цфо": CLUSTER_CENTRAL,
    "сзфо": CLUSTER_NW,
    "юфо": CLUSTER_SOUTH,
    "скфо": CLUSTER_SOUTH,
    "пфо": CLUSTER_VOLGA,
    "урфо": CLUSTER_EAST,
    "сфо": CLUSTER_EAST,
    "дфо": CLUSTER_EAST,
}


def oblast_okrug_to_cluster(oblast_okrug: str | None) -> str | None:
    """Map WB oblastOkrugName (customer delivery federal district) to cluster.

    Returns None if not recognized — caller should fall back to warehouse_to_cluster.
    """
    if not oblast_okrug:
        return None
    return _OBLAST_OKRUG_MAP.get(oblast_okrug.strip().lower())


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


ALL_CLUSTERS = [CLUSTER_CENTRAL, CLUSTER_VOLGA, CLUSTER_SOUTH, CLUSTER_NW, CLUSTER_EAST, CLUSTER_OTHER]
