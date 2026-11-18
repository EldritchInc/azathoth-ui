"""What a request says of its data: Azathoth's label for it, if it gives one (ADR 0011)."""

from azathoth import api


def sensitivity_of(
    value: object,
    name: str = "sensitivity",
) -> api.Sensitivity | None:
    """Return the label a request gives its data, or `None` when it gives none.

    Raises:
        InvalidArgumentError: It is not one of Azathoth's labels, by `name`.
    """

    if value is None:
        return None

    if isinstance(value, str):
        try:
            return api.Sensitivity(value)
        except ValueError:
            pass

    raise api.InvalidArgumentError(f"{name} must be public, internal or restricted, not {value!r}.")


__all__ = [
    "sensitivity_of",
]
