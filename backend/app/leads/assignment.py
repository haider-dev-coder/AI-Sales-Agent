from itertools import cycle

DEFAULT_SALES_REPS = [{"id": "default", "name": "Sales Team", "email": None, "active": True}]
_rep_cycle = cycle(DEFAULT_SALES_REPS)


def assign_sales_rep() -> dict[str, object]:
    return next(_rep_cycle)
