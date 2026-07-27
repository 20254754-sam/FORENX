"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

export function EvidencePhotoGallery({ photos, evidenceId }: { photos: string[]; evidenceId: string }) {
  const [selected, setSelected] = useState<number | null>(null);
  const image = selected === null ? null : photos[selected];

  useEffect(() => {
    if (selected === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected(null);
      if (event.key === "ArrowLeft") setSelected((value) => value === null ? null : (value - 1 + photos.length) % photos.length);
      if (event.key === "ArrowRight") setSelected((value) => value === null ? null : (value + 1) % photos.length);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [photos.length, selected]);

  if (photos.length === 0) {
    return <p className="gallery-empty">No 2D photos were captured for this record.</p>;
  }

  function previous() {
    setSelected((value) => value === null ? 0 : (value - 1 + photos.length) % photos.length);
  }

  function next() {
    setSelected((value) => value === null ? 0 : (value + 1) % photos.length);
  }

  return (
    <>
      <div className="evidence-gallery" aria-label={`${evidenceId} evidence photos`}>
        {photos.map((photo, index) => (
          <button key={`${photo.slice(0, 48)}-${index}`} className="evidence-gallery-item" type="button" onClick={() => setSelected(index)} aria-label={`Open evidence photo ${index + 1} of ${photos.length}`}>
            <span className="relative block aspect-[4/3] overflow-hidden bg-slate-950">
              <Image src={photo} alt={`Evidence photo ${index + 1} for ${evidenceId}`} fill sizes="(max-width: 639px) 90vw, (max-width: 1023px) 44vw, 250px" unoptimized className="object-cover" />
            </span>
            <span className="evidence-gallery-caption">Photo {index + 1}</span>
          </button>
        ))}
      </div>
      {image && selected !== null && (
        <div className="image-viewer" role="dialog" aria-modal="true" aria-label={`Evidence photo ${selected + 1} viewer`}>
          <button className="image-viewer-backdrop" type="button" aria-label="Close image viewer" onClick={() => setSelected(null)} />
          <section className="image-viewer-content">
            <div className="flex items-center justify-between gap-3 border-b border-slate-700 px-3 py-2.5">
              <p className="text-sm font-semibold text-white">{evidenceId} <span className="font-normal text-slate-400">Photo {selected + 1} of {photos.length}</span></p>
              <button className="btn-secondary min-h-8 px-3 text-xs" type="button" onClick={() => setSelected(null)}>Close</button>
            </div>
            <div className="relative mx-auto aspect-[4/3] max-h-[70vh] w-full bg-black">
              <Image src={image} alt={`Evidence photo ${selected + 1} for ${evidenceId}`} fill sizes="90vw" unoptimized className="object-contain" priority />
            </div>
            {photos.length > 1 && (
              <div className="flex justify-between gap-2 border-t border-slate-700 px-3 py-2.5">
                <button className="btn-secondary min-h-9" type="button" onClick={previous}>Previous</button>
                <button className="btn-primary min-h-9" type="button" onClick={next}>Next</button>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
