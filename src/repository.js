import {icon} from './icons.js';
export const REPOSITORY_URL='https://github.com/YunxiQWQ/fold-studio';
export const repositoryLink=(id,label='GitHub')=>`<a id="${id}" class="repository-link" href="${REPOSITORY_URL}" target="_blank" rel="noopener noreferrer" title="折间 GitHub 开源仓库">${icon('github')}<span>${label}</span></a>`;
