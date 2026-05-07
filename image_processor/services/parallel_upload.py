from concurrent.futures import ThreadPoolExecutor, as_completed

from infra.oci_client import upload_variant


def upload_variants_in_parallel(
    job_id: str, filename: str, variant_images: dict[str, bytes], max_workers: int = 4
) -> list[str]:
    if not variant_images:
        return []

    worker_count = min(max_workers, len(variant_images))
    urls: list[str] = []

    with ThreadPoolExecutor(max_workers=worker_count) as executor:
        futures = {
            executor.submit(upload_variant, job_id, variant_name, image_bytes, filename): variant_name
            for variant_name, image_bytes in variant_images.items()
        }
        for future in as_completed(futures):
            urls.append(future.result())

    return urls
