"""Dedicated process for scheduled background jobs."""

import asyncio
import logging

from server import shutdown, startup


async def run() -> None:
    await startup()
    logging.getLogger("worker").info("Background worker started")
    try:
        await asyncio.Event().wait()
    finally:
        await shutdown()


if __name__ == "__main__":
    asyncio.run(run())
