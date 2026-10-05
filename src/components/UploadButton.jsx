import React, { useRef } from 'react';

// Opens the phone's native photo/video picker. Multiple selection supported.
export default function UploadButton({ accept, onFiles, children, variant = 'primary', disabled }) {
  const inputRef = useRef(null);
  return (
    <>
      <button
        type="button"
        className={`btn btn-${variant}`}
        onClick={() => inputRef.current && inputRef.current.click()}
        disabled={disabled}
      >
        {children}
      </button>
      <input
        ref={inputRef}
        className="visually-hidden"
        type="file"
        multiple
        accept={accept}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          e.target.value = ''; // allow choosing the same files again
          if (files.length) onFiles(files);
        }}
      />
    </>
  );
}
