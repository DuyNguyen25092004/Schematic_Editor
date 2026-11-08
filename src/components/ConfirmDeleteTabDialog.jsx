import React, { useEffect } from 'react';

export default function ConfirmDeleteTabDialog({
  isOpen,
  tab,
  isLastTab,
  onConfirm,
  onCancel,
}) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel?.();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        onConfirm?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onConfirm, onCancel]);

  if (!isOpen || !tab) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.45)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          background: '#ffffff',
          borderRadius: 12,
          boxShadow: '0 12px 36px rgba(0, 0, 0, 0.22)',
          padding: '22px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          border: '1px solid #f0f0f0',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: '#fff2f0',
              border: '1px solid #ffccc7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
              flexShrink: 0,
            }}
          >
            ⚠️
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#1f1f1f' }}>
              {isLastTab ? 'Reset Tab Confirmation' : 'Close Tab Confirmation'}
            </h3>
            <span style={{ fontSize: 12, color: '#8c8c8c' }}>
              {tab.type === 'waveform' ? 'Waveform Tab' : 'Schematic Tab'}
            </span>
          </div>
        </div>

        {/* Body content */}
        <div style={{ fontSize: 14, color: '#434343', lineHeight: 1.5 }}>
          {isLastTab ? (
            <p style={{ margin: 0 }}>
              This is the only remaining tab. Closing it will <strong>reset</strong> the entire schematic canvas{' '}
              <span style={{ color: '#1677ff', fontWeight: 600 }}>"{tab.title || tab.id}"</span> back to a blank state.
              Are you sure you want to continue?
            </p>
          ) : (
            <p style={{ margin: 0 }}>
              Are you sure you want to close tab{' '}
              <span style={{ color: '#ff4d4f', fontWeight: 600 }}>"{tab.title || tab.id}"</span>?{' '}
              All unsaved components and data in this tab will be permanently lost.
            </p>
          )}
        </div>

        {/* Footer actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '7px 16px',
              borderRadius: 6,
              border: '1px solid #d9d9d9',
              background: '#ffffff',
              color: '#595959',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#4096ff';
              e.currentTarget.style.color = '#1677ff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#d9d9d9';
              e.currentTarget.style.color = '#595959';
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            autoFocus
            onClick={onConfirm}
            style={{
              padding: '7px 16px',
              borderRadius: 6,
              border: 'none',
              background: isLastTab ? '#faad14' : '#ff4d4f',
              color: '#ffffff',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: isLastTab ? '0 2px 4px rgba(250,173,20,0.3)' : '0 2px 4px rgba(255,77,79,0.3)',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.filter = 'brightness(1.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.filter = 'none';
            }}
          >
            {isLastTab ? 'Reset Canvas' : 'Close Tab'}
          </button>
        </div>
      </div>
    </div>
  );
}
