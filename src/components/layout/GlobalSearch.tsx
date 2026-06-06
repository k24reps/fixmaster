import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '@/components/ui';
import { useCollection } from '@/hooks/useCollection';
import { searchAll, groupResults, type SearchResult } from '@/lib/business/search';
import styles from './GlobalSearch.module.css';

/**
 * Global search across services, customers, and inventory. Debounced query,
 * grouped dropdown, full keyboard nav (↑/↓/Enter/Esc). Selecting a result
 * navigates to its target page. Pure matching lives in lib/business/search.
 */
export function GlobalSearch() {
  const navigate = useNavigate();
  const { data: services } = useCollection('services');
  const { data: customers } = useCollection('customers');
  const { data: inventory } = useCollection('inventory');

  const [raw, setRaw] = useState('');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounce the query so we don't re-search on every keystroke. Resetting
  // the highlight here (inside the timeout) keeps setState out of the effect
  // body, which the react-hooks lint rule forbids.
  useEffect(() => {
    const id = setTimeout(() => {
      setQuery(raw);
      setActive(0);
    }, 150);
    return () => clearTimeout(id);
  }, [raw]);

  const results = useMemo(
    () => searchAll(query, { services, customers, inventory }),
    [query, services, customers, inventory],
  );
  const groups = useMemo(() => groupResults(results), [results]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const choose = useCallback(
    (r: SearchResult) => {
      navigate(r.to);
      setOpen(false);
      setRaw('');
      setQuery('');
      inputRef.current?.blur();
    },
    [navigate],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!results.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (a + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (a - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const chosen = results[active];
      if (chosen) choose(chosen);
    }
  };

  const showDropdown = open && query.trim().length > 0;

  return (
    <div className={styles.root} ref={rootRef}>
      <div className={styles.search}>
        <Icon name="magnifying-glass" aria-hidden />
        <input
          ref={inputRef}
          type="text"
          value={raw}
          placeholder="Cari servis, pelanggan, barang…"
          aria-label="Pencarian global"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls="global-search-listbox"
          onChange={(e) => setRaw(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {raw && (
          <button
            className={styles.clear}
            onClick={() => {
              setRaw('');
              setQuery('');
              inputRef.current?.focus();
            }}
            aria-label="Bersihkan pencarian"
          >
            <Icon name="times" aria-hidden />
          </button>
        )}
      </div>

      {showDropdown && (
        <div className={styles.dropdown} id="global-search-listbox" role="listbox">
          {results.length === 0 ? (
            <div className={styles.empty}>
              <Icon name="magnifying-glass" aria-hidden />
              <span>Tidak ada hasil untuk "{query}"</span>
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.type} className={styles.group}>
                <div className={styles.groupLabel}>{group.label}</div>
                {group.items.map((r) => {
                  const index = results.indexOf(r);
                  return (
                    <button
                      key={`${r.type}-${r.id}`}
                      className={[styles.item, index === active ? styles.itemActive : ''].join(' ')}
                      role="option"
                      aria-selected={index === active}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => choose(r)}
                    >
                      <span className={styles.itemIcon}>
                        <Icon name={r.icon} aria-hidden />
                      </span>
                      <span className={styles.itemText}>
                        <strong>{r.title}</strong>
                        <small>{r.subtitle}</small>
                      </span>
                      <Icon name="arrow-right" className={styles.itemGo} aria-hidden />
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
