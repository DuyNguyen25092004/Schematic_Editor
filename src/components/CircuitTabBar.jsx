import React, { useState, useRef, useEffect } from 'react';

/**
 * Thanh Tab Bar hiển thị các bản vẽ và waveform đang mở ở dưới cùng màn hình.
 * Hỗ trợ chuyển đổi tab, tạo tab mới (Schematic hoặc Waveform), đóng tab, đổi tên tab trực tiếp.
 */
export default function CircuitTabBar({
  tabs = [],
  activeTabId,
  onSelectTab,
  onNewTab,
  onCloseTab,
  onRenameTab,
}) {
  const [editingTabId, setEditingTabId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [newTabMenuOpen, setNewTabMenuOpen] = useState(false);
  const tabsContainerRef = useRef(null);
  const addMenuRef = useRef(null);

  // Close new tab menu when clicking outside
  useEffect(() => {
    if (!newTabMenuOpen) return;
    const handlePointerDown = (e) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target)) {
        setNewTabMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [newTabMenuOpen]);

  // Tự động cuộn đến tab đang chọn khi activeTabId thay đổi
  useEffect(() => {
    if (!tabsContainerRef.current) return;
    const activeEl = tabsContainerRef.current.querySelector(`[data-tab-id="${activeTabId}"]`);
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }, [activeTabId]);

  const handleStartRename = (e, tab) => {
    e.stopPropagation();
    setEditingTabId(tab.id);
    setEditTitle(tab.title || (tab.type === 'waveform' ? 'Waveform' : 'Schematic'));
  };

  const handleFinishRename = (tabId) => {
    if (editingTabId === tabId) {
      const trimmed = editTitle.trim();
      if (trimmed) {
        onRenameTab?.(tabId, trimmed);
      }
      setEditingTabId(null);
    }
  };

  return (
    <div
      id="circuit-tab-bar"
      className="circuit-tab-bar"
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 38,
        background: '#f0f2f5',
        borderTop: '1px solid #d9d9d9',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        padding: '0 10px',
        zIndex: 50,
        userSelect: 'none',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: 12,
        boxShadow: '0 -2px 10px rgba(0, 0, 0, 0.05)',
      }}
    >
      {/* Left section: Tab list + Add button */}
      <div style={{ display: 'flex', alignItems: 'flex-end', height: '100%', maxWidth: 'calc(100% - 130px)' }}>
        {/* Horizontal scrolling tab list */}
        <div
          ref={tabsContainerRef}
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: 4,
            overflowX: 'auto',
            height: '100%',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            paddingBottom: 0,
          }}
        >
          {tabs.map((tab, idx) => {
            const isActive = tab.id === activeTabId;
            const isEditing = editingTabId === tab.id;
            const isWaveform = tab.type === 'waveform';

            return (
              <div
                key={tab.id}
                data-tab-id={tab.id}
                onClick={() => onSelectTab?.(tab.id)}
                onDoubleClick={(e) => handleStartRename(e, tab)}
                title={isEditing ? '' : `${tab.title} (Double-click to rename)`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  height: 32,
                  padding: '0 10px 0 12px',
                  borderRadius: '6px 6px 0 0',
                  cursor: 'pointer',
                  background: isActive ? '#ffffff' : '#e4e7eb',
                  color: isActive ? '#1677ff' : '#595959',
                  border: isActive ? '1px solid #d9d9d9' : '1px solid #d0d4d9',
                  borderBottom: isActive ? '1px solid #ffffff' : 'none',
                  borderTop: isActive ? '2px solid #1677ff' : '1px solid #d0d4d9',
                  fontWeight: isActive ? 600 : 500,
                  transition: 'all 0.15s ease',
                  position: 'relative',
                  boxShadow: isActive ? '0 -2px 6px rgba(0,0,0,0.04)' : 'none',
                  flexShrink: 0,
                }}
              >
                {/* Tab Icon: 📈 for waveform, 📄 for schematic */}
                <span style={{ fontSize: 13, display: 'flex', alignItems: 'center', opacity: isActive ? 1 : 0.7 }}>
                  {isWaveform ? '📈' : '📄'}
                </span>

                {/* Tab title or edit input */}
                {isEditing ? (
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onBlur={() => handleFinishRename(tab.id)}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === 'Enter') handleFinishRename(tab.id);
                      if (e.key === 'Escape') setEditingTabId(null);
                    }}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      width: 110,
                      height: 20,
                      fontSize: 12,
                      fontWeight: 600,
                      padding: '1px 5px',
                      border: '1px solid #1677ff',
                      borderRadius: 4,
                      outline: 'none',
                      background: '#fff',
                      color: '#000',
                    }}
                  />
                ) : (
                  <span
                    style={{
                      maxWidth: 130,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {tab.title || (isWaveform ? `Waveform ${idx + 1}` : `Sheet ${idx + 1}`)}
                  </span>
                )}

                {/* Close tab button (×) */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab?.(tab.id);
                  }}
                  title={tabs.length <= 1 ? 'Reset sheet' : 'Close this tab'}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    border: 'none',
                    background: 'transparent',
                    color: isActive ? '#8c8c8c' : '#a0a0a0',
                    fontSize: 12,
                    cursor: 'pointer',
                    padding: 0,
                    marginLeft: 2,
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#ff4d4f';
                    e.currentTarget.style.color = '#ffffff';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = isActive ? '#8c8c8c' : '#a0a0a0';
                  }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>

        {/* Add sheet button (+) with Dropdown Popover (Outside scrolling tab list) */}
        <div ref={addMenuRef} style={{ position: 'relative', display: 'flex', alignItems: 'center', flexShrink: 0, marginLeft: 4, marginBottom: 3 }}>
          <button
            type="button"
            id="tab-add-btn"
            onClick={() => setNewTabMenuOpen((prev) => !prev)}
            title="Add new tab (+)"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 26,
              height: 26,
              borderRadius: 6,
              border: newTabMenuOpen ? '1px solid #1677ff' : '1px solid #d9d9d9',
              background: newTabMenuOpen ? '#e6f4ff' : '#ffffff',
              color: newTabMenuOpen ? '#1677ff' : '#555',
              fontSize: 15,
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              if (!newTabMenuOpen) {
                e.currentTarget.style.background = '#e6f4ff';
                e.currentTarget.style.color = '#1677ff';
                e.currentTarget.style.borderColor = '#91caff';
              }
            }}
            onMouseLeave={(e) => {
              if (!newTabMenuOpen) {
                e.currentTarget.style.background = '#ffffff';
                e.currentTarget.style.color = '#555';
                e.currentTarget.style.borderColor = '#d9d9d9';
              }
            }}
          >
            +
          </button>

          {/* New Tab Menu Popover */}
          {newTabMenuOpen && (
            <div
              id="new-tab-menu"
              style={{
                position: 'absolute',
                bottom: 'calc(100% + 6px)',
                left: 0,
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: 8,
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.16)',
                zIndex: 1000,
                minWidth: 190,
                padding: '6px',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
              }}
            >
              <div
                style={{
                  padding: '4px 8px 3px 8px',
                  fontSize: 10,
                  fontWeight: 700,
                  color: '#94a3b8',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                Create New Tab
              </div>

              <div
                id="create-schematic-tab-opt"
                onClick={() => {
                  onNewTab?.('schematic');
                  setNewTabMenuOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 10px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: 12,
                  color: '#1e293b',
                  fontWeight: 500,
                  transition: 'background 0.1s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f5f9')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <span style={{ fontSize: 15 }}>📄</span>
                <div>
                  <div style={{ fontWeight: 600 }}>Schematic Sheet</div>
                  <div style={{ fontSize: 10, color: '#64748b' }}>Cadence Virtuoso canvas</div>
                </div>
              </div>

              <div
                id="create-waveform-tab-opt"
                onClick={() => {
                  onNewTab?.('waveform');
                  setNewTabMenuOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 10px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: 12,
                  color: '#1e293b',
                  fontWeight: 500,
                  transition: 'background 0.1s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f5f9')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <span style={{ fontSize: 15 }}>📈</span>
                <div>
                  <div style={{ fontWeight: 600 }}>Waveform Editor</div>
                  <div style={{ fontSize: 10, color: '#64748b' }}>WaveDrom timing diagram</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sheet count */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          color: '#8c8c8c',
          fontSize: 11,
          paddingBottom: 4,
          flexShrink: 0,
        }}
      >
        <span>{tabs.length} tab{tabs.length > 1 ? 's' : ''}</span>
      </div>
    </div>
  );
}
