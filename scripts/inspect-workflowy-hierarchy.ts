/**
 * Script to inspect raw Workflowy hierarchy structure
 * Run: npx tsx scripts/inspect-workflowy-hierarchy.ts <url>
 */

const url = process.argv[2];

if (!url) {
  console.error('Usage: npx tsx scripts/inspect-workflowy-hierarchy.ts <workflowy-url>');
  process.exit(1);
}

interface WorkflowyNode {
  nm?: string;       // name (bullet text, can contain HTML)
  no?: string;       // notes
  ch?: WorkflowyNode[];  // children
  id?: string;
  lm?: number;       // last modified
  cp?: number;       // completed
}

async function fetchRawHierarchy(nodeIdOrUrl: string): Promise<{
  tree: WorkflowyNode | null;
  flatNodes: Array<{ id: string; nm: string; level: number; childCount: number }>;
}> {
  console.log('Fetching:', nodeIdOrUrl);

  // Step 1: Fetch share page for cookies and share_id
  const sharePageResponse = await fetch(nodeIdOrUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

  if (!sharePageResponse.ok) {
    throw new Error(`Failed to fetch share page: ${sharePageResponse.status}`);
  }

  const html = await sharePageResponse.text();

  // Extract cookies
  const rawSetCookie = sharePageResponse.headers.get('set-cookie') || '';
  const cookiePairs: string[] = [];
  const cookieStrings = rawSetCookie.split(/,(?=[^;]*=)/);
  for (const cookieStr of cookieStrings) {
    const match = cookieStr.match(/^\s*([^=]+)=([^;]*)/);
    if (match) {
      cookiePairs.push(`${match[1].trim()}=${match[2].trim()}`);
    }
  }
  const cookies = cookiePairs.join('; ');

  // Extract share_id
  const shareIdPatterns = [
    /share_id['"]\s*:\s*['"]([^'"]+)['"]/,
    /PROJECT_TREE_DATA_URL_PARAMS.*?share_id=([^&'"]+)/,
    /get_initialization_data\?share_id=([^&'"]+)/,
    /"shareId"\s*:\s*"([^"]+)"/,
    /share_id=([A-Za-z0-9._-]+)/,
  ];

  let internalShareId: string | null = null;
  for (const pattern of shareIdPatterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      internalShareId = match[1];
      break;
    }
  }

  if (!internalShareId) {
    throw new Error('Could not extract share_id');
  }

  console.log('Found share_id:', internalShareId);

  // Step 2: Fetch initialization data
  const initUrl = `https://workflowy.com/get_initialization_data?share_id=${encodeURIComponent(internalShareId)}&client_version=21`;
  const initResponse = await fetch(initUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json',
      'Referer': nodeIdOrUrl,
      'Cookie': cookies,
      'X-Requested-With': 'XMLHttpRequest',
    },
  });

  if (!initResponse.ok) {
    throw new Error(`Failed to fetch init data: ${initResponse.status}`);
  }

  const initData = await initResponse.json();
  const projectTreeData = initData.projectTreeData;

  if (!projectTreeData) {
    throw new Error('No projectTreeData in response');
  }

  // Get the tree structure - create a virtual root with all top-level children
  let rootNode: WorkflowyNode = { nm: '(ROOT)', ch: [] };

  const mainInfo = projectTreeData.mainProjectTreeInfo;
  if (mainInfo?.rootProjectChildren && Array.isArray(mainInfo.rootProjectChildren)) {
    rootNode.ch = mainInfo.rootProjectChildren;
  } else if (mainInfo?.rootProject) {
    rootNode.ch = [mainInfo.rootProject];
  }

  const auxInfos = projectTreeData.auxiliaryProjectTreeInfos;
  if (Array.isArray(auxInfos) && auxInfos.length > 0) {
    for (const aux of auxInfos) {
      if (aux.rootProjectChildren && Array.isArray(aux.rootProjectChildren)) {
        rootNode.ch!.push(...aux.rootProjectChildren);
      }
    }
  }

  console.log(`Found ${rootNode.ch?.length || 0} top-level nodes`);

  // Flatten for analysis
  const flatNodes: Array<{ id: string; nm: string; level: number; childCount: number }> = [];

  function flatten(node: WorkflowyNode, level: number) {
    const name = (node.nm || '').replace(/<[^>]*>/g, '').substring(0, 80);
    flatNodes.push({
      id: node.id || 'unknown',
      nm: name,
      level,
      childCount: node.ch?.length || 0,
    });
    if (node.ch) {
      for (const child of node.ch) {
        flatten(child, level + 1);
      }
    }
  }

  flatten(rootNode, 0);

  return { tree: rootNode, flatNodes };
}

function stripHtml(html: string): string {
  return html
    .replace(/<a[^>]+href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi, '[$2]($1)')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim();
}

function printTree(node: WorkflowyNode, indent: number = 0, maxDepth: number = 5) {
  if (indent > maxDepth) return;

  const prefix = '  '.repeat(indent);
  const name = stripHtml(node.nm || '(empty)').substring(0, 60);
  const childCount = node.ch?.length || 0;

  console.log(`${prefix}${name}${childCount > 0 ? ` [${childCount} children]` : ''}`);

  if (node.ch) {
    for (const child of node.ch) {
      printTree(child, indent + 1, maxDepth);
    }
  }
}

async function main() {
  try {
    const { tree, flatNodes } = await fetchRawHierarchy(url);

    console.log('\n=== HIERARCHY STRUCTURE (depth 5) ===\n');
    printTree(tree, 0, 5);

    console.log('\n=== STATISTICS ===');
    console.log(`Total nodes: ${flatNodes.length}`);

    const levelCounts: Record<number, number> = {};
    for (const node of flatNodes) {
      levelCounts[node.level] = (levelCounts[node.level] || 0) + 1;
    }
    console.log('Nodes per level:', levelCounts);

    // Find DOK patterns
    console.log('\n=== DOK PATTERNS FOUND ===');
    const dokPatterns = flatNodes.filter(n =>
      /DOK\s*[1-4]/i.test(n.nm) || /facts?:/i.test(n.nm) || /summary/i.test(n.nm)
    );
    for (const node of dokPatterns) {
      console.log(`  Level ${node.level}: "${node.nm}" (${node.childCount} children)`);
    }

    // Find source patterns
    console.log('\n=== SOURCE PATTERNS FOUND ===');
    const sourcePatterns = flatNodes.filter(n =>
      /^source/i.test(n.nm) || /https?:\/\//.test(n.nm)
    );
    for (const node of sourcePatterns.slice(0, 10)) {
      console.log(`  Level ${node.level}: "${node.nm.substring(0, 50)}..."`);
    }

  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

main();
