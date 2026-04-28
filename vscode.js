const mockConfig = {
  get: (key, def) => {
    if (key === 'geminiApiKey') return process.env.GEMINI_API_KEY || '';
    if (key === 'groqApiKey') return process.env.GROQ_API_KEY || '';
    if (key === 'primaryAiProvider') return 'gemini';
    return def;
  }
};
module.exports = {
  workspace: {
    getConfiguration: () => mockConfig
  }
};
