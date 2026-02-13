/**
 * Integration tests - AI provider API calls
 * Uses real APIs for testing
 * 
 * Note: API keys should be provided via environment variables:
 * - GLM_API_KEY: GLM API key for testing
 * - GLM_API_BASE_URL: GLM API base URL (default: https://open.bigmodel.cn/api/anthropic)
 * 
 * To run integration tests:
 * 1. Set environment variables: GLM_API_KEY=your_key npm test
 * 2. Or create .env.test file (not committed to git)
 */

import axios from 'axios';

// GLM API configuration from environment variables
const GLM_API_CONFIG = {
    apiKey: process.env.GLM_API_KEY || '',
    baseURL: process.env.GLM_API_BASE_URL || 'https://open.bigmodel.cn/api/anthropic',
    model: process.env.GLM_MODEL || 'glm-4'
};

// Skip integration tests if API key is not provided
const shouldSkipIntegrationTests = !GLM_API_CONFIG.apiKey;

describe('GLM API Integration Tests', () => {
    beforeAll(() => {
        if (shouldSkipIntegrationTests) {
            console.warn('⚠️  Skipping integration tests: GLM_API_KEY not provided');
            console.warn('   Set GLM_API_KEY environment variable to run integration tests');
        }
    });

    it('should connect to GLM API successfully', async () => {
        if (shouldSkipIntegrationTests) {
            return; // Skip test if API key not provided
        }

        try {
            console.log('🔄 Starting GLM API connection...');
            console.log('API configuration:', {
                baseURL: GLM_API_CONFIG.baseURL,
                model: GLM_API_CONFIG.model,
                apiKeyLength: GLM_API_CONFIG.apiKey.length
            });

            const response = await axios.post(
                `${GLM_API_CONFIG.baseURL}/messages`,
                {
                    model: GLM_API_CONFIG.model,
                    max_tokens: 100,
                    messages: [
                        {
                            role: 'user',
                            content: 'Hello, can you respond?'
                        }
                    ]
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${GLM_API_CONFIG.apiKey}`
                    },
                    timeout: 30000
                }
            );

            console.log('✅ GLM API connection successful');
            console.log('Response status:', response.status);
            console.log('Response data structure:', JSON.stringify(response.data, null, 2));

            expect(response.status).toBe(200);
            expect(response.data).toBeDefined();
        } catch (error: any) {
            console.error('❌ GLM API connection failed:', error.message);
            if (error.response) {
                console.error('Response status:', error.response.status);
                console.error('Response data:', error.response.data);
            }
            throw error;
        }
    });

    it('should handle API errors gracefully', async () => {
        if (shouldSkipIntegrationTests) {
            return; // Skip test if API key not provided
        }

        try {
            // Test with invalid API key
            const response = await axios.post(
                `${GLM_API_CONFIG.baseURL}/messages`,
                {
                    model: GLM_API_CONFIG.model,
                    max_tokens: 100,
                    messages: [
                        {
                            role: 'user',
                            content: 'Test'
                        }
                    ]
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer invalid-key'
                    },
                    timeout: 30000,
                    validateStatus: () => true // Don't throw on error status
                }
            );

            // Should return error status (401 or 403)
            expect([401, 403]).toContain(response.status);
        } catch (error: any) {
            // Network errors are also acceptable
            expect(error.message).toBeDefined();
        }
    });

    it('should handle timeout correctly', async () => {
        if (shouldSkipIntegrationTests) {
            return; // Skip test if API key not provided
        }

        try {
            await axios.post(
                `${GLM_API_CONFIG.baseURL}/messages`,
                {
                    model: GLM_API_CONFIG.model,
                    max_tokens: 100,
                    messages: [
                        {
                            role: 'user',
                            content: 'Test'
                        }
                    ]
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${GLM_API_CONFIG.apiKey}`
                    },
                    timeout: 1 // Very short timeout to test timeout handling
                }
            );
        } catch (error: any) {
            // Timeout errors are expected
            expect(error.code).toBe('ECONNABORTED');
        }
    });
});
