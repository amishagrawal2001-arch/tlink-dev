import axios from 'axios';
import { getAllProviders } from '../providers/config.js';

/**
 * Aggregate models from all configured providers visible to the user.
 */
export async function listModels(req, res) {
    const allowedProviders = req.user?.allowedProviders;
    const providers = getAllProviders(allowedProviders);
    const seen = new Set();
    const models = [];
    const errors = [];

    for (const p of providers) {
        const headers = { 'Content-Type': 'application/json' };
        if (p.apiKey) {
            headers['Authorization'] = `Bearer ${p.apiKey}`;
        }
        const url = `${p.baseURL.replace(/\/$/, '')}/models`;
        try {
            const resp = await axios.get(url, { headers, timeout: p.timeout || 30000 });
            const list = resp.data?.data || [];
            list.forEach((m) => {
                const id = m?.id;
                if (id && !seen.has(id)) {
                    seen.add(id);
                    models.push({ id, owned_by: m?.owned_by, provider: p.name });
                }
            });
        } catch (error) {
            const status = error?.response?.status;
            errors.push({ provider: p.name, status: status || null, message: error?.message });
        }
    }

    res.json({
        object: 'list',
        data: models,
        errors: errors.length > 0 ? errors : undefined,
        providerCount: providers.length
    });
}
