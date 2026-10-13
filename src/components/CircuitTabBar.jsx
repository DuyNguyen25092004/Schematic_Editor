import React, { useState, useRef, useEffect } from 'react';

/**
 * Thanh Tab Bar hiển thị các bản vẽ đang mở ở dưới cùng màn hình.
 * Hỗ trợ chuyển đổi tab, tạo tab mới, đóng tab, đổi tên tab trực tiếp bằng cách nhấp đúp chuột.
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
  const tabsContainerRef = useRef(null);

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
    setEditTitle(tab.title || 'Schematic');
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
        zIndex: 35,
        userSelect: 'none',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: 12,
        boxShadow: '0 -2px 10px rgba(0, 0, 0, 0.05)',
      }}
    >
      {/* Horizontal scrolling tab list */}
      <div
        ref={tabsContainerRef}
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 4,
          overflowX: 'auto',
          maxWidth: 'calc(100% - 130px)',
          height: '100%',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          paddingBottom: 0,
        }}
      >
        {tabs.map((tab, idx) => {
          const isActive = tab.id === activeTabId;
          const isEditing = editingTabId === tab.id;

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
              {/* Sheet icon */}
              <span style={{ fontSize: 13, display: 'flex', alignItems: 'center', opacity: isActive ? 1 : 0.7 }}>
                📄
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
                  {tab.title || `Sheet ${idx + 1}`}
                </span>
              )}

              {/* Close tab button (×) */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab?.(tab.id);
                }}
                title={tabs.length <= 1 ? 'Close and create new schematic' : 'Close this schematic'}
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

        {/* Add sheet button (+) */}
        <button
          type="button"
          onClick={onNewTab}
          title="New Schematic Sheet (+)"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 26,
            height: 26,
            borderRadius: 6,
            border: '1px solid #d9d9d9',
            background: '#ffffff',
            color: '#555',
            fontSize: 15,
            fontWeight: 700,
            cursor: 'pointer',
            flexShrink: 0,
            marginBottom: 3,
            marginLeft: 2,
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#e6f4ff';
            e.currentTarget.style.color = '#1677ff';
            e.currentTarget.style.borderColor = '#91caff';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#ffffff';
            e.currentTarget.style.color = '#555';
            e.currentTarget.style.borderColor = '#d9d9d9';
          }}
        >
          +
        </button>
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
        <span>{tabs.length} sheet{tabs.length > 1 ? 's' : ''}</span>
      </div>
    </div>
  );
}
