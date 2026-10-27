import { createSvedocsHtmlHandle } from 'svedocs/routes';
import config from 'virtual:svedocs/config';
import pages from 'virtual:svedocs/page-index';

export const handle = createSvedocsHtmlHandle({ config, pages });
