// NeatTabs Popup Script
// Handles the popup UI for displaying and managing tab groups

document.addEventListener('DOMContentLoaded', init);

let isEnabled = true;

async function init() {
  // Load settings
  const settings = await chrome.storage.local.get(['enabled']);
  isEnabled = settings.enabled !== false;
  updateToggleButton();
  
  // Load tab groups
  await loadTabGroups();
  
  // Set up toggle button
  document.getElementById('toggleBtn').addEventListener('click', toggleGrouping);
}

function updateToggleButton() {
  const btn = document.getElementById('toggleBtn');
  if (isEnabled) {
    btn.classList.add('enabled');
    btn.classList.remove('disabled');
    btn.innerHTML = '<span class="toggle-icon">✓</span>';
    btn.title = 'Grouping enabled - Click to disable';
  } else {
    btn.classList.remove('enabled');
    btn.classList.add('disabled');
    btn.innerHTML = '<span class="toggle-icon">✗</span>';
    btn.title = 'Grouping disabled - Click to enable';
  }
}

async function toggleGrouping() {
  isEnabled = !isEnabled;
  await chrome.storage.local.set({ enabled: isEnabled });
  updateToggleButton();
}

async function loadTabGroups() {
  const groupsList = document.getElementById('groupsList');
  
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getTabGroups' });
    
    if (!response || !response.groups || response.groups.length === 0) {
      groupsList.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📑</div>
          <div class="empty-state-text">No tab groups yet.<br>Open some tabs to get started!</div>
        </div>
      `;
      updateCounts(0, 0);
      return;
    }
    
    const { groups, activeTabId } = response;
    
    // Count totals
    let totalTabs = 0;
    groups.forEach(g => totalTabs += g.tabs.length);
    updateCounts(totalTabs, groups.length);
    
    // Render groups
    groupsList.innerHTML = groups.map(group => renderGroup(group, activeTabId)).join('');
    
    // Add event listeners
    addEventListeners();
    
    // Auto-expand group with active tab
    const activeGroup = groups.find(g => g.tabs.some(t => t.id === activeTabId));
    if (activeGroup) {
      const card = document.querySelector(`[data-group-id="${activeGroup.id}"]`);
      if (card) card.classList.add('expanded');
    }
    
  } catch (error) {
    console.error('Error loading tab groups:', error);
    groupsList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <div class="empty-state-text">Error loading tabs.<br>Try refreshing.</div>
      </div>
    `;
  }
}

function renderGroup(group, activeTabId) {
  const tabsHtml = group.tabs.map(tab => renderTab(tab, activeTabId)).join('');
  
  return `
    <div class="group-card" data-group-id="${group.id}">
      <div class="group-header">
        <div class="group-color ${group.color}"></div>
        <span class="group-title">${escapeHtml(group.title)}</span>
        <span class="group-badge">${group.tabs.length}</span>
        <span class="group-chevron">▼</span>
      </div>
      <div class="tabs-list">
        ${tabsHtml}
      </div>
    </div>
  `;
}

function renderTab(tab, activeTabId) {
  const isActive = tab.id === activeTabId;
  const faviconHtml = tab.favIconUrl 
    ? `<img class="tab-favicon" src="${escapeHtml(tab.favIconUrl)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="tab-favicon-placeholder" style="display:none">🌐</div>`
    : `<div class="tab-favicon-placeholder">🌐</div>`;
  
  return `
    <div class="tab-item ${isActive ? 'active' : ''}" data-tab-id="${tab.id}">
      ${faviconHtml}
      <span class="tab-title" title="${escapeHtml(tab.title)}">${escapeHtml(tab.title)}</span>
      <button class="tab-close" data-tab-id="${tab.id}" title="Close tab">✕</button>
    </div>
  `;
}

function addEventListeners() {
  // Group header click - expand/collapse
  document.querySelectorAll('.group-header').forEach(header => {
    header.addEventListener('click', (e) => {
      const card = header.closest('.group-card');
      card.classList.toggle('expanded');
    });
  });
  
  // Tab item click - switch to tab
  document.querySelectorAll('.tab-item').forEach(item => {
    item.addEventListener('click', async (e) => {
      if (e.target.classList.contains('tab-close')) return;
      
      const tabId = parseInt(item.dataset.tabId);
      await chrome.runtime.sendMessage({ action: 'switchToTab', tabId });
      window.close();
    });
  });
  
  // Close button click - close tab
  document.querySelectorAll('.tab-close').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const tabId = parseInt(btn.dataset.tabId);
      await chrome.runtime.sendMessage({ action: 'closeTab', tabId });
      await loadTabGroups(); // Refresh list
    });
  });
}

function updateCounts(tabs, groups) {
  document.getElementById('tabCount').textContent = `${tabs} tab${tabs !== 1 ? 's' : ''}`;
  document.getElementById('groupCount').textContent = `${groups} group${groups !== 1 ? 's' : ''}`;
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
