"""One crawl run, passed explicitly from the orchestrator to a crawler."""
import asyncio


class RunHandle:
    """The run that owns a source. Never stored on a crawler instance.

    Saves run in a worker thread. A save cannot be cancelled once it has started, so the handle
    keeps it; the orchestrator waits for it before finishing the run.
    """

    def __init__(self, token, source_id):
        self.token = str(token)
        self.source_id = str(source_id)
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
        return await asyncio.shield(future)

    async def wait_for_saves(self) -> None:
        while self._pending:
            await asyncio.gather(*list(self._pending), return_exceptions=True)
