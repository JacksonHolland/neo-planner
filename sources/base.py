"""Abstract base class for alert source adapters."""

from __future__ import annotations

import abc
from typing import List

from core.target import Target


class SourceAdapter(abc.ABC):
    """
    Every alert source (NEOCP, Scout, Fink, …) implements this interface.

    Adding a new source to the platform means subclassing SourceAdapter
    and implementing ``fetch()``.
    """

    name: str = "base"

    @abc.abstractmethod
    def fetch(self) -> List[Target]:
        """
        Poll the source and return a list of Targets in the common schema.

        Implementations should handle network errors gracefully and return
        an empty list on failure rather than raising.
        """
        ...

    def __repr__(self) -> str:
        return f"<{self.__class__.__name__} source={self.name!r}>"

