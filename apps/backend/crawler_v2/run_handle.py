"""One crawl run, passed explicitly from the orchestrator to a crawler."""
import asyncio

# Each run spends one request and time budget in the fetch policy; the orchestrator sets it.
from contracts.outbound import crawl_budget

__all__ = ["RunHandle", "crawl_budget"]

_TOTALS = ("inserted", "updated", "skipped", "failed")


class RunHandle:
    """The run that owns a source. Never stored on a crawler instance.

    Saves run in a worker thread. A save cannot be cancelled once it has started, so the handle
    keeps it; the orchestrator waits for it before finishing the run. The counts of completed
    saves are kept too, so a run that times out still records what it saved.
    """

    def __init__(self, token, source_id):
        if not token:
            raise ValueError("a run needs its token")
        self.token = str(token)
        self.source_id = str(source_id)
        self.saved = dict.fromkeys(_TOTALS, 0)
        self._pending: set = set()

    async def save(self, save_jobs, jobs, source_id, org_name, **kwargs):
        loop = asyncio.get_running_loop()
        future = asyncio.ensure_future(
            asyncio.to_thread(
                save_jobs, jobs, source_id, org_name, run_token=self.token, loop=loop, **kwargs
            )
        )
        self._pending.add(future)
        future.add_done_callback(self._pending.discard)
        future.add_done_callback(self._count)
        return await asyncio.shield(future)

    def _count(self, future) -> None:
        if future.cancelled() or future.exception() is not None:
            return
        for name in _TOTALS:
            self.saved[name] += future.result().get(name, 0) or 0

    async def wait_for_saves(self) -> None:
        while self._pending:
            await asyncio.gather(*list(self._pending), return_exceptions=True)
