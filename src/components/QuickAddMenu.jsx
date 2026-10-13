import React, { useState, useEffect, useRef, useMemo } from 'react';
import { COMPONENT_LIBRARY, COMPONENT_CATEGORIES } from '../constants';
import { MiniIcon } from '../symbols/index.jsx';

// Hàm chuẩn hóa chuỗi không dấu tiếng Việt và chữ thường để tìm kiếm linh hoạt
function stripAccents(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

// ============ HỘP GỢI Ý ĐẶT LINH KIỆN NHANH (PHÍM "I") ============
function QuickAddMenu({ onPick, onClose }) {
  const allCategoryIds = useMemo(() => COMPONENT_CATEGORIES.map((c) => c.id), []);
  const [selectedCategories, setSelectedCategories] = useState(() => new Set(allCategoryIds));
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Tự động focus ô tìm kiếm khi mở menu
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Lắng nghe phím Esc toàn cục để đóng menu
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [onClose]);

  // Bộ lọc linh kiện dựa trên search query và họ linh kiện
  const filteredComponents = useMemo(() => {
    const q = stripAccents(searchQuery.trim());
    return COMPONENT_LIBRARY.filter((comp) => {
      // 1. Lọc theo họ linh kiện
      if (selectedCategories.size > 0 && !selectedCategories.has(comp.category)) {
        return false;
      }
      if (selectedCategories.size === 0) {
        return false;
      }

      // 2. Lọc theo từ khóa tìm kiếm
      if (!q) return true;
      const labelMatch = stripAccents(comp.label).includes(q);
      const shortMatch = stripAccents(comp.short || '').includes(q);
      const typeMatch = stripAccents(comp.type).includes(q);
      const prefixMatch = stripAccents(comp.refPrefix || '').includes(q);
      return labelMatch || shortMatch || typeMatch || prefixMatch;
    });
  }, [searchQuery, selectedCategories]);

  // Reset selectedIndex khi danh sách thay đổi
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchQuery, selectedCategories]);

  // Cuộn item được chọn vào view
  useEffect(() => {
    if (!listRef.current) return;
    const activeEl = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // Bật/tắt tất cả danh mục
  const isAllSelected = selectedCategories.size === allCategoryIds.length;
  const toggleAllCategories = () => {
    if (isAllSelected) {
      setSelectedCategories(new Set());
    } else {
      setSelectedCategories(new Set(allCategoryIds));
    }
  };

  // Bật/tắt từng danh mục
  const toggleCategory = (catId) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) {
        next.delete(catId);
      } else {
        next.add(catId);
      }
      return next;
    });
  };

  // Điều hướng bằng bàn phím
  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (filteredComponents.length > 0) {
        setSelectedIndex((prev) => (prev + 1) % filteredComponents.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (filteredComponents.length > 0) {
        setSelectedIndex((prev) => (prev - 1 + filteredComponents.length) % filteredComponents.length);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredComponents.length > 0 && filteredComponents[selectedIndex]) {
        onPick(filteredComponents[selectedIndex]);
      }
    }
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 50,
        background: '#ffffff',
        border: '1px solid #d9d9d9',
        borderRadius: 12,
        boxShadow: '0 16px 40px rgba(0, 0, 0, 0.22)',
        width: 560,
        maxWidth: '92vw',
        maxHeight: '84vh',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 18px',
          borderBottom: '1px solid #f0f0f0',
          background: '#fafafa',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>⚡</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#1f1f1f' }}>
            Quick Add Component
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: '2px 7px',
              borderRadius: 10,
              background: '#e6f4ff',
              color: '#0958d9',
              border: '1px solid #91caff',
            }}
          >
            {filteredComponents.length} / {COMPONENT_LIBRARY.length}
          </span>
        </div>
        <button
          onClick={() => onClose?.()}
          style={{
            background: 'transparent',
            border: 'none',
            fontSize: 16,
            color: '#8c8c8c',
            cursor: 'pointer',
            padding: '2px 6px',
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title="Close (Esc)"
          onMouseEnter={(e) => { e.currentTarget.style.color = '#ff4d4f'; e.currentTarget.style.background = '#fff1f0'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#8c8c8c'; e.currentTarget.style.background = 'transparent'; }}
        >
          ✕
        </button>
      </div>

      {/* Search Bar */}
      <div style={{ padding: '12px 18px 8px 18px', position: 'relative' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            background: '#f5f5f5',
            border: '1px solid #d9d9d9',
            borderRadius: 8,
            padding: '0 12px',
            transition: 'all 0.2s',
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = '#1677ff'; e.currentTarget.style.background = '#fff'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = '#d9d9d9'; e.currentTarget.style.background = '#f5f5f5'; }}
        >
          <span style={{ fontSize: 14, color: '#8c8c8c', marginRight: 8 }}>🔍</span>
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search by name or type (e.g., NMOS, DFF, Res, VDD, Inverter)..."
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              padding: '9px 0',
              fontSize: 13,
              color: '#262626',
            }}
          />
          {searchQuery && (
            <button
              onClick={() => { setSearchQuery(''); inputRef.current?.focus(); }}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#bfbfbf',
                cursor: 'pointer',
                fontSize: 12,
                padding: '2px 4px',
              }}
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Category Filter Checkboxes */}
      <div style={{ padding: '4px 18px 10px 18px', borderBottom: '1px solid #f0f0f0' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#8c8c8c', marginBottom: 6 }}>
          CATEGORIES:
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {/* Checkbox "All" */}
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '3px 8px',
              borderRadius: 6,
              cursor: 'pointer',
              background: isAllSelected ? '#e6f4ff' : '#f5f5f5',
              border: isAllSelected ? '1px solid #91caff' : '1px solid #d9d9d9',
              fontSize: 12,
              fontWeight: 600,
              color: isAllSelected ? '#0958d9' : '#595959',
              userSelect: 'none',
              transition: 'all 0.15s',
            }}
          >
            <input
              type="checkbox"
              checked={isAllSelected}
              onChange={toggleAllCategories}
              style={{ cursor: 'pointer', margin: 0 }}
            />
            All
          </label>

          {/* Checkbox for each category */}
          {COMPONENT_CATEGORIES.map((cat) => {
            const isChecked = selectedCategories.has(cat.id);
            return (
              <label
                key={cat.id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '3px 8px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  background: isChecked ? '#f0f5ff' : '#fafafa',
                  border: isChecked ? '1px solid #adc6ff' : '1px solid #e8e8e8',
                  fontSize: 11,
                  fontWeight: isChecked ? 600 : 400,
                  color: isChecked ? '#1d39c4' : '#8c8c8c',
                  userSelect: 'none',
                  transition: 'all 0.15s',
                }}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleCategory(cat.id)}
                  style={{ cursor: 'pointer', margin: 0 }}
                />
                {cat.label}
              </label>
            );
          })}
        </div>
      </div>

      {/* Component List (Scrollable 2-Column Grid) */}
      <div
        ref={listRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 18px',
          maxHeight: '44vh',
        }}
      >
        {filteredComponents.length === 0 ? (
          <div
            style={{
              padding: '36px 12px',
              textAlign: 'center',
              color: '#8c8c8c',
            }}
          >
            <div style={{ fontSize: 24, marginBottom: 8 }}>🔍</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#595959' }}>
              No matching components found
            </div>
            <div style={{ fontSize: 12, marginTop: 4, color: '#bfbfbf' }}>
              Try different keywords or enable more categories
            </div>
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedCategories(new Set(allCategoryIds));
                inputRef.current?.focus();
              }}
              style={{
                marginTop: 12,
                padding: '5px 14px',
                borderRadius: 6,
                border: '1px solid #d9d9d9',
                background: '#fafafa',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                color: '#1677ff',
              }}
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 8,
            }}
          >
            {filteredComponents.map((comp, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={comp.type}
                  data-index={idx}
                  onClick={() => onPick(comp)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 10px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    background: isSelected ? '#e6f4ff' : '#ffffff',
                    border: isSelected ? '1px solid #91caff' : '1px solid #f0f0f0',
                    boxShadow: isSelected ? '0 2px 6px rgba(22, 119, 255, 0.12)' : 'none',
                    transition: 'all 0.12s',
                    userSelect: 'none',
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: isSelected ? '#fff' : '#fafafa',
                      borderRadius: 6,
                      border: '1px solid #f0f0f0',
                      flexShrink: 0,
                    }}
                  >
                    <MiniIcon type={comp.type} data={comp.defaultData} />
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: isSelected ? '#0958d9' : '#262626',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {comp.label}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        marginTop: 2,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 500,
                          padding: '1px 4px',
                          borderRadius: 4,
                          background: '#f5f5f5',
                          color: '#8c8c8c',
                          fontFamily: 'monospace',
                        }}
                      >
                        {comp.short || comp.type}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 18px',
          borderTop: '1px solid #f0f0f0',
          background: '#fafafa',
          fontSize: 11,
          color: '#8c8c8c',
        }}
      >
        <div>
          <span style={{ fontWeight: 600, color: '#595959' }}>↑↓</span> Navigate •{' '}
          <span style={{ fontWeight: 600, color: '#595959' }}>Enter</span> Select •{' '}
          <span style={{ fontWeight: 600, color: '#595959' }}>Esc</span> Close
        </div>
        <div style={{ fontWeight: 500 }}>
          {filteredComponents.length} items
        </div>
      </div>
    </div>
  );
}

export default QuickAddMenu;
