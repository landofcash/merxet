const el = id => document.getElementById(id);
let plan, account, busy = false;
const provider = () => { if (!window.ethereum?.request) throw Error('Install or enable your Ethereum browser wallet, then refresh this page.'); return window.ethereum; };
const key = () => `merxet-ens-setup:${plan.admin}:${plan.registry}`;
async function refresh() {
  const response = await fetch('/plan'); if (!response.ok) throw Error(await response.text()); plan = await response.json(); render();
}
function render() {
  el('identity').textContent = `Parent: ${plan.parentName}\nAdmin: ${plan.admin}\nOperator: ${plan.operator}\nRegistry: ${plan.registry}\nNetwork: Ethereum Sepolia`;
  el('steps').replaceChildren();
  const next = plan.steps.find(step => !step.complete);
  for (const step of plan.steps) {
    const row = document.createElement('li'), text = document.createElement('span'); text.textContent = `${step.complete ? 'Complete: ' : ''}${step.title}`; row.append(text);
    const details = document.createElement('details'), summary = document.createElement('summary'), pre = document.createElement('pre');
    summary.textContent = 'Review transaction'; pre.textContent = JSON.stringify(step.transaction, null, 2); details.append(summary, pre); row.append(details);
    if (!step.complete) { const button = document.createElement('button'); button.textContent = 'Review in wallet'; button.disabled = busy || step !== next || account !== plan.admin;
      button.onclick = () => void run(() => send(step)); row.append(button); }
    el('steps').append(row);
  }
  el('variables').hidden = !!next;
  if (!next) el('variables').textContent = `Setup verified. Add these values to the builder environment, then restart it:\n\nENS_SUBNAME_REGISTRY_ADDRESS=${plan.registry}\nENS_ENABLED=true\n\nEnable only one coordinator for this operator wallet, including local and hosted instances.`;
}
async function mined(hash) {
  el('message').textContent = `Waiting for transaction ${hash}. You can check it in your wallet.`;
  for (;;) {
    const receipt = await provider().request({method: 'eth_getTransactionReceipt', params: [hash]});
    if (receipt) { localStorage.removeItem(key()); if (receipt.status !== '0x1') throw Error('Transaction reverted. Review the wallet activity and refresh status.'); return; }
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
}
async function connect() {
  const accounts = await provider().request({method: 'eth_requestAccounts'}); account = accounts[0]?.toLowerCase();
  if (account !== plan.admin) throw Error(`Select the administrator wallet ${plan.admin}.`);
  await provider().request({method: 'wallet_switchEthereumChain', params: [{chainId: '0xaa36a7'}]});
  el('message').textContent = 'Administrator connected. Review each setup transaction below.';
}
async function send(step) {
  if ((await provider().request({method: 'eth_chainId'})) !== '0xaa36a7') throw Error('Switch your wallet to Ethereum Sepolia.');
  const accounts = await provider().request({method: 'eth_accounts'}); if (accounts[0]?.toLowerCase() !== plan.admin) throw Error('Select the configured administrator wallet.');
  const previous = localStorage.getItem(key());
  if (previous) { await mined(previous); await refresh(); return; }
  // Persist every returned hash before waiting. Never resubmit a known pending transaction.
  const hash = await provider().request({method: 'eth_sendTransaction', params: [step.transaction]});
  localStorage.setItem(key(), hash); await mined(hash); await refresh(); el('message').textContent = 'Transaction confirmed. Continue with the next step.';
}
async function run(action) {
  if (busy) return; busy = true; if (plan) render();
  try { await action(); } catch (error) { el('message').textContent = error.message || 'The wallet request was interrupted. Check wallet activity before retrying.'; }
  finally { busy = false; if (plan) render(); }
}
el('connect').onclick = () => void run(connect); el('refresh').onclick = () => void run(refresh); void run(refresh);
