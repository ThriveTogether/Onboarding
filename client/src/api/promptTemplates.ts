import authedApi from './auth';

export interface PromptTemplateMeta {
  prompt_type: string;
  template_version: string;
  description: string;
  required_variables: string[];
  optional_variables: string[];
}

export interface PromptTemplateFull extends PromptTemplateMeta {
  prompt: string;
  notes_for_authors?: string;
}

export interface PreviewResponse {
  prompt_type: string;
  template_version: string;
  vertical_used: string;
  rendered: string;
}

export const promptTemplatesAPI = {
  list: async (): Promise<PromptTemplateMeta[]> => {
    const { data } = await authedApi.get<{ templates: PromptTemplateMeta[] }>('/api/prompt-templates');
    return data.templates;
  },

  get: async (promptType: string, vertical?: string): Promise<PromptTemplateFull> => {
    const params = vertical ? { vertical } : undefined;
    const { data } = await authedApi.get<{ template: PromptTemplateFull }>(
      `/api/prompt-templates/${promptType}`,
      { params },
    );
    return data.template;
  },

  preview: async (
    promptType: string,
    variables: Record<string, string>,
    vertical?: string,
  ): Promise<PreviewResponse> => {
    const { data } = await authedApi.post<PreviewResponse>(
      `/api/prompt-templates/${promptType}/preview`,
      { variables, vertical },
    );
    return data;
  },
};
