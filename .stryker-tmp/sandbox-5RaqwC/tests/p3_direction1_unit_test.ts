// @ts-nocheck
import { MarkdownParser } from '../src/utils/MarkdownParser.js';
import * as fs from 'fs';
import * as path from 'path';

const testSkillPath = path.join(process.cwd(), 'tests/test_skill.md');

function setupTestSkill(content: string) {
    fs.writeFileSync(testSkillPath, content, 'utf8');
}

function cleanup() {
    if (fs.existsSync(testSkillPath)) fs.unlinkSync(testSkillPath);
}

console.log('=== Unit Test: MarkdownParser ===');

try {
    // 1. Valid table
    console.log('Test 1: Valid table');
    setupTestSkill(`
## 阶段-角色映射表 (Stage-Role Mapping)

| Stage | 阶段名称 | 主要负责人 | 协作角色 | 阶段指引 |
|-------|---------|-----------|---------|----------|
| 0 | Brainstorming | architect | developer, qa_lead | guidance 0 |
| 3 | Forward Briefing | developer | qa_lead | guidance 3 |
`);
    const mapping1 = MarkdownParser.parseStageRoleMapping(testSkillPath);
    if (mapping1.size === 2 && mapping1.get(0)?.primaryRole === 'architect' && mapping1.get(3)?.primaryRole === 'developer') {
        console.log('✓ PASS: Valid table parsed correctly');
    } else {
        console.error('✗ FAIL: Valid table parsing failed');
        console.log('Mapping size:', mapping1.size);
    }

    // 2. Malformed table (missing columns)
    console.log('Test 2: Malformed table (missing columns)');
    setupTestSkill(`
## 阶段-角色映射表

| Stage | Name |
|---|---|
| 0 | Brainstorming |
`);
    const mapping2 = MarkdownParser.parseStageRoleMapping(testSkillPath);
    if (mapping2.size === 0) {
        console.log('✓ PASS: Malformed table correctly returns empty mapping');
    } else {
        console.error('✗ FAIL: Malformed table should return empty mapping, but got size', mapping2.size);
    }

    // 3. Table with empty values
    console.log('Test 3: Table with empty values');
    setupTestSkill(`
| Stage | Name | Owner | Collaborators | Guidance |
|---|---|---|---|---|
| 5 | Test | qa_lead | - | test guidance |
`);
    const mapping3 = MarkdownParser.parseStageRoleMapping(testSkillPath);
    const stage5 = mapping3.get(5);
    if (stage5 && stage5.collaborators.length === 0) {
        console.log('✓ PASS: Empty collaborators handled correctly');
    } else {
        console.error('✗ FAIL: Empty collaborators handling failed');
    }

} finally {
    cleanup();
}

console.log('=== Test Completed ===');
