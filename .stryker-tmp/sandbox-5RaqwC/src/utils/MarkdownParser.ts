// @ts-nocheck
import * as fs from 'fs';
import { Logger } from './Logger.js';

const log = new Logger('MarkdownParser');

export interface StageProtocol {
    stage: number;
    name: string;
    primaryRole: string;
    collaborators: string[];
    guidance: string;
}

/**
 * Utility for parsing structured data from Markdown files.
 */
export class MarkdownParser {
    /**
     * Parses the Stage-Role Mapping table from dev-workflow SKILL.md.
     * Uses robust regex to extract table rows.
     */
    static parseStageRoleMapping(filePath: string): Map<number, StageProtocol> {
        const mapping = new Map<number, StageProtocol>();
        
        try {
            if (!fs.existsSync(filePath)) {
                log.warn(`SKILL.md not found at ${filePath}, using defaults.`);
                return mapping;
            }

            const content = fs.readFileSync(filePath, 'utf8');
            
            // Regex to find the table rows: | Stage | Name | Owner | Collaborators | Guidance |
            // Pattern matches: | digit | text | text | text | text |
            const rowRegex = /^\|\s*(\d+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|/gm;
            
            let match;
            while ((match = rowRegex.exec(content)) !== null) {
                const stage = parseInt(match[1], 10);
                const name = match[2].trim();
                const primaryRole = match[3].trim();
                const collaborators = match[4].trim() === '-' 
                    ? [] 
                    : match[4].split(',').map(s => s.trim());
                const guidance = match[5].trim();

                mapping.set(stage, {
                    stage,
                    name,
                    primaryRole,
                    collaborators,
                    guidance
                });
            }

            if (mapping.size === 0) {
                log.error(`No valid rows found in ${filePath} mapping table.`);
            } else {
                log.debug(`Successfully parsed ${mapping.size} stages from ${filePath}`);
            }

        } catch (error) {
            log.error(`Failed to parse Stage-Role mapping: ${error}`);
        }

        return mapping;
    }
}
