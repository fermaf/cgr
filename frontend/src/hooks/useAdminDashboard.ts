import { useState, useEffect } from 'react';
import type { MultidimensionalResponse, DictamenHistoryResponse, MigrationInfoResponse } from '../types';

export function useAdminDashboard(filters: { yearFrom?: number; yearTo?: number } = {}) {
    const [data, setData] = useState<MultidimensionalResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;
        setLoading(true);

        const params = new URLSearchParams();
        if (filters.yearFrom) params.append('yearFrom', filters.yearFrom.toString());
        if (filters.yearTo) params.append('yearTo', filters.yearTo.toString());

        fetch(`/api/v1/analytics/multidimensional?${params.toString()}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        })
            .then(res => {
                if (!res.ok) throw new Error('Error fetcheando datos multidimensionales');
                return res.json();
            })
            .then((json: MultidimensionalResponse) => {
                if (isMounted) {
                    setData(json);
                    setError(null);
                }
            })
            .catch(err => {
                if (isMounted) setError(err.message);
            })
            .finally(() => {
                if (isMounted) setLoading(false);
            });

        return () => { isMounted = false; };
    }, [filters.yearFrom, filters.yearTo]);

    return { data, loading, error };
}

export function useDictamenHistory(dictamenId: string) {
    const [history, setHistory] = useState<DictamenHistoryResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!dictamenId) return;
        let isMounted = true;
        setLoading(true);

        fetch(`/api/v1/dictamenes/${dictamenId}/history`)
            .then(res => {
                if (!res.ok) throw new Error('Dictamen no encontrado o error en servidor');
                return res.json();
            })
            .then(json => {
                if (isMounted) {
                    setHistory(json);
                    setError(null);
                }
            })
            .catch(err => {
                if (isMounted) setError(err.message);
            })
            .finally(() => {
                if (isMounted) setLoading(false);
            });

        return () => { isMounted = false; };
    }, [dictamenId]);

    return { history, loading, error };
}

export function useMigrationInfo() {
    const [data, setData] = useState<MigrationInfoResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;

        const fetchData = (showLoading = false) => {
            if (showLoading) setLoading(true);
            fetch('/api/v1/admin/migration/info')
                .then(res => {
                    if (!res.ok) throw new Error('Error al obtener información de migración');
                    return res.json();
                })
                .then((json: MigrationInfoResponse) => {
                    if (isMounted) {
                        setData(json);
                        setError(null);
                    }
                })
                .catch(err => {
                    if (isMounted) setError(err.message);
                })
                .finally(() => {
                    if (isMounted) setLoading(false);
                });
        };

        fetchData(true); // Carga inicial con spinner

        const interval = setInterval(() => {
            fetchData(false); // Refrescos silenciosos en background
        }, 10000);

        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, []);

    return { data, loading, error };
}
