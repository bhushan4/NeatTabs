// NeatTabs Background Service Worker
// Handles tab grouping logic and Chrome API interactions

// App name mappings for specific services (subdomain -> app name)
const APP_NAME_MAPPINGS = {
  // Google services - each gets its own group
  'mail.google.com': 'Gmail',
  'drive.google.com': 'Drive',
  'docs.google.com': 'Docs',
  'sheets.google.com': 'Sheets',
  'slides.google.com': 'Slides',
  'calendar.google.com': 'Calendar',
  'meet.google.com': 'Meet',
  'photos.google.com': 'Photos',
  'maps.google.com': 'Maps',
  'news.google.com': 'Google News',
  'play.google.com': 'Play Store',
  'youtube.com': 'YouTube',
  'www.youtube.com': 'YouTube',
  'music.youtube.com': 'YouTube Music',
  'studio.youtube.com': 'YouTube Studio',
  
  // Microsoft services
  'outlook.live.com': 'Outlook',
  'outlook.office.com': 'Outlook',
  'onedrive.live.com': 'OneDrive',
  'teams.microsoft.com': 'Teams',
  'office.com': 'Office',
  
  // Amazon services - keep shopping separate from AWS
  'console.aws.amazon.com': 'AWS',
  'aws.amazon.com': 'AWS',
  's3.console.aws.amazon.com': 'AWS',
  
  // GitHub
  'gist.github.com': 'GitHub Gist',
  
  // Other common services
  'web.whatsapp.com': 'WhatsApp',
  'web.telegram.org': 'Telegram',
  'discord.com': 'Discord',
  'app.slack.com': 'Slack',
  'twitter.com': 'Twitter',
  'x.com': 'X',
  'linkedin.com': 'LinkedIn',
  'www.linkedin.com': 'LinkedIn',
  'facebook.com': 'Facebook',
  'www.facebook.com': 'Facebook',
  'instagram.com': 'Instagram',
  'www.instagram.com': 'Instagram',
  'reddit.com': 'Reddit',
  'www.reddit.com': 'Reddit',
  'netflix.com': 'Netflix',
  'www.netflix.com': 'Netflix',
  'open.spotify.com': 'Spotify',
};

const GROUP_COLORS = ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange', 'grey'];

// Track used colors per window to ensure unique colors
const windowColorIndex = new Map();

// Extract hostname from URL
function getHostname(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (e) {
    return null;
  }
}

// Get base domain from hostname
function getBaseDomain(hostname) {
  if (!hostname) return null;
  const parts = hostname.split('.');
  
  // Handle common TLDs
  if (parts.length >= 2) {
    const lastTwo = parts.slice(-2).join('.');
    if (['co.uk', 'com.au', 'co.jp', 'com.br', 'co.in'].includes(lastTwo) && parts.length >= 3) {
      return parts.slice(-3).join('.');
    }
    return parts.slice(-2).join('.');
  }
  return hostname;
}

// Get app/group name for a URL - prioritizes specific app names
function getGroupName(url) {
  const hostname = getHostname(url);
  if (!hostname) return null;
  
  // First check if there's a specific app name mapping
  if (APP_NAME_MAPPINGS[hostname]) {
    return APP_NAME_MAPPINGS[hostname];
  }
  
  // Check without www prefix
  const withoutWww = hostname.replace(/^www\./, '');
  if (APP_NAME_MAPPINGS[withoutWww]) {
    return APP_NAME_MAPPINGS[withoutWww];
  }
  
  // For unmapped URLs, use the base domain name (capitalized)
  const baseDomain = getBaseDomain(hostname);
  if (!baseDomain) return null;
  
  // Extract the main name from the domain
  const mainName = baseDomain.split('.')[0];
  return mainName.charAt(0).toUpperCase() + mainName.slice(1);
}

// Get next available color for a window (ensures unique colors)
async function getNextAvailableColor(windowId) {
  const groups = await chrome.tabGroups.query({ windowId });
  const usedColors = new Set(groups.map(g => g.color));
  
  // Find first unused color
  for (const color of GROUP_COLORS) {
    if (!usedColors.has(color)) {
      return color;
    }
  }
  
  // If all colors used, cycle through based on index
  const index = windowColorIndex.get(windowId) || 0;
  windowColorIndex.set(windowId, (index + 1) % GROUP_COLORS.length);
  return GROUP_COLORS[index];
}

// Listen for tab creation
chrome.tabs.onCreated.addListener(async (tab) => {
  if (tab.url) {
    await handleTabGrouping(tab);
  }
});

// Listen for tab URL updates
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    await handleTabGrouping(tab);
  }
});

// Handle tab grouping logic
async function handleTabGrouping(tab) {
  const settings = await chrome.storage.local.get(['enabled', 'exceptions', 'sensitivity']);
  if (settings.enabled === false) return;
  
  const groupName = getGroupName(tab.url);
  if (!groupName) return;
  
  const hostname = getHostname(tab.url);
  
  // Check exceptions
  if (settings.exceptions?.some(exc => hostname?.includes(exc))) return;
  
  // Find existing group or create new one
  const groups = await chrome.tabGroups.query({ windowId: tab.windowId });
  const existingGroup = groups.find(g => g.title === groupName);
  
  if (existingGroup) {
    await chrome.tabs.group({ tabIds: tab.id, groupId: existingGroup.id });
  } else {
    // Check if there are other tabs that should be in the same group
    const allTabs = await chrome.tabs.query({ windowId: tab.windowId });
    const sameGroupTabs = allTabs.filter(t => {
      const tabGroupName = getGroupName(t.url);
      return tabGroupName === groupName;
    });
    
    if (sameGroupTabs.length > 1) {
      // Get a unique color for this new group
      const color = await getNextAvailableColor(tab.windowId);
      const groupId = await chrome.tabs.group({ tabIds: sameGroupTabs.map(t => t.id) });
      await chrome.tabGroups.update(groupId, { title: groupName, color: color });
    }
  }
}

// Listen for keyboard shortcuts
chrome.commands.onCommand.addListener(async (command) => {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const groups = await chrome.tabGroups.query({ windowId: activeTab.windowId });
  
  if (groups.length === 0) return;
  
  const currentGroupIndex = groups.findIndex(g => g.id === activeTab.groupId);
  
  if (command === 'next-group') {
    const nextIndex = (currentGroupIndex + 1) % groups.length;
    const tabsInGroup = await chrome.tabs.query({ groupId: groups[nextIndex].id });
    if (tabsInGroup.length > 0) {
      await chrome.tabs.update(tabsInGroup[0].id, { active: true });
    }
  } else if (command === 'prev-group') {
    const prevIndex = currentGroupIndex <= 0 ? groups.length - 1 : currentGroupIndex - 1;
    const tabsInGroup = await chrome.tabs.query({ groupId: groups[prevIndex].id });
    if (tabsInGroup.length > 0) {
      await chrome.tabs.update(tabsInGroup[0].id, { active: true });
    }
  }
});

// Context menu for tab options
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'tabsuite-ungroup',
    title: 'Ungroup this tab',
    contexts: ['action']
  });
  
  chrome.contextMenus.create({
    id: 'tabsuite-close-group',
    title: 'Close entire group',
    contexts: ['action']
  });
  
  // Initialize default settings
  chrome.storage.local.set({
    enabled: true,
    sensitivity: 'balanced',
    exceptions: [],
    customColors: {}
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'tabsuite-ungroup' && tab.groupId !== -1) {
    await chrome.tabs.ungroup(tab.id);
  } else if (info.menuItemId === 'tabsuite-close-group' && tab.groupId !== -1) {
    const tabsInGroup = await chrome.tabs.query({ groupId: tab.groupId });
    await chrome.tabs.remove(tabsInGroup.map(t => t.id));
  }
});

// Message handler for popup communication
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getTabGroups') {
    handleGetTabGroups().then(sendResponse);
    return true;
  } else if (message.action === 'switchToTab') {
    chrome.tabs.update(message.tabId, { active: true });
    sendResponse({ success: true });
  } else if (message.action === 'closeTab') {
    chrome.tabs.remove(message.tabId);
    sendResponse({ success: true });
  } else if (message.action === 'ungroupTabs') {
    chrome.tabs.ungroup(message.tabIds);
    sendResponse({ success: true });
  } else if (message.action === 'closeGroup') {
    chrome.tabs.remove(message.tabIds);
    sendResponse({ success: true });
  } else if (message.action === 'updateGroupColor') {
    chrome.tabGroups.update(message.groupId, { color: message.color });
    sendResponse({ success: true });
  }
  return true;
});

async function handleGetTabGroups() {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const allTabs = await chrome.tabs.query({ windowId: activeTab.windowId });
  const groups = await chrome.tabGroups.query({ windowId: activeTab.windowId });
  
  const groupedData = groups.map(group => {
    const tabsInGroup = allTabs.filter(t => t.groupId === group.id);
    return {
      id: group.id,
      title: group.title,
      color: group.color,
      collapsed: group.collapsed,
      tabs: tabsInGroup.map(t => ({
        id: t.id,
        title: t.title,
        url: t.url,
        favIconUrl: t.favIconUrl,
        active: t.active
      }))
    };
  });
  
  // Add ungrouped tabs
  const ungroupedTabs = allTabs.filter(t => t.groupId === -1);
  if (ungroupedTabs.length > 0) {
    groupedData.push({
      id: -1,
      title: 'Ungrouped',
      color: 'grey',
      collapsed: false,
      tabs: ungroupedTabs.map(t => ({
        id: t.id,
        title: t.title,
        url: t.url,
        favIconUrl: t.favIconUrl,
        active: t.active
      }))
    });
  }
  
  return { groups: groupedData, activeTabId: activeTab.id };
}