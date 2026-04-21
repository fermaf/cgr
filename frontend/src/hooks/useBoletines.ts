import { useState, useEffect, useCallback } from 'react';
import type { Boletin } from '../types';

export function useBoletines() {
    const [boletines, setBoletines] = useState<Boletin[]>([]);
    const [stats, setStats] = useState<{ candidates: number; last_generated: string | null } | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchStats = useCallback(async () => {
        try {
            const res = await fetch('/api/v1/boletines/stats');
            if (!res.ok) throw new Error('Error al obtener estadísticas');
            const json = await res.json();
            setStats(json.data);
        } catch (err) {
            console.error(err);
        }
    }, []);

    const fetchBoletines = useCallback(async () => {
        try {
            const res = await fetch('/api/v1/boletines');
            if (!res.ok) throw new Error('Error al obtener boletines');
            const json = await res.json();
            setBoletines(json.data || []);
            setError(null);
            fetchStats(); // Actualizar stats cada vez que actualizamos lista
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [fetchStats]);

    const fetchBoletinDetail = async (id: string): Promise<Boletin | null> => {
        try {
            const res = await fetch(`/api/v1/boletines/${id}`);
            if (!res.ok) throw new Error('Error al obtener detalle del boletín');
            const json = await res.json();
            return json.data;
        } catch (err) {
            console.error(err);
            return null;
        }
    };

    const createBoletin = async (params: { 
        fecha_inicio: string; 
        fecha_fin: string; 
        filtro_boletin: boolean; 
        filtro_relevante: boolean; 
        filtro_recurso_prot: boolean; 
    }) => {
        setLoading(true);
        try {
            const res = await fetch('/api/v1/boletines', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(params)
            });
            if (!res.ok) throw new Error('Error al crear boletín');
            await fetchBoletines();
            return await res.json();
        } catch (err: any) {
            setError(err.message);
            setLoading(false);
            return null;
        }
    };

    useEffect(() => {
        fetchBoletines();
        // Polling para actualizar estados
        const interval = setInterval(fetchBoletines, 10000);
        return () => clearInterval(interval);
    }, [fetchBoletines]);

    return { boletines, stats, loading, error, fetchBoletines, fetchBoletinDetail, createBoletin };
}
