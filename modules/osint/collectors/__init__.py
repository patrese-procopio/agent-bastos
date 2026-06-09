from .base import BaseCollector, run_collectors_parallel
from .factory import build_collectors
from .mock import MockCollector
from .datajud import DataJudCollector
from .cnpj_ws import CnpjWsCollector
from .sources import BrasilIoCollector, DouCollector, GNewsCollector

__all__ = [
    'BaseCollector', 'run_collectors_parallel', 'build_collectors',
    'MockCollector', 'DataJudCollector', 'CnpjWsCollector',
    'BrasilIoCollector', 'DouCollector', 'GNewsCollector',
]
