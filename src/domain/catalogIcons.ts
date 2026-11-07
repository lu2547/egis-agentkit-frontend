const experts = ['developer', 'architect', 'founder', 'embedded', 'workbench', 'wechat', 'academic', 'research', 'knowledge', 'fullstack', 'python', 'godot'];
const skills = ['tencent-finance', 'minimax-xlsx', 'ai-news', 'ppt', 'web-access', 'legal-search', 'kdocs', 'deep-thinking', 'wecom', 'minimax-docx', 'tencent-pdfkit', 'neodata', 'minimax-h3', 'dingtalk', 'browser-skill'];
const svgSkills = new Set(['minimax-xlsx', 'web-access', 'kdocs', 'minimax-docx', 'dingtalk']);
export const catalogIcons = {
  expert: experts.map(name => ({ id: `expert:${name}`, url: `/catalog/experts/${name}.webp`, label: name })),
  skill: skills.map(name => ({ id: `skill:${name}`, url: `/catalog/skills/${name}.${svgSkills.has(name) ? 'svg' : 'webp'}`, label: name })),
};
export function catalogIconUrl(id: unknown): string | undefined {
  return [...catalogIcons.expert, ...catalogIcons.skill].find(icon => icon.id === id)?.url;
}
