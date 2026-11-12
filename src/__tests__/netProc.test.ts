import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addressKind, connectionsOf, hexToIp, parseProcNet } from '../lib/netProc';

test('addresses are read in the phone byte order', () => {
  assert.equal(hexToIp('0100007F'), '127.0.0.1');
  assert.equal(hexToIp('8901A8C0'), '192.168.1.137');
  assert.equal(hexToIp('00000000'), '0.0.0.0');
  // An IPv4 address carried in an IPv6 socket.
  assert.equal(hexToIp('0000000000000000FFFF00008901A8C0'), '192.168.1.137');
  assert.equal(hexToIp('00000000000000000000000000000000'), '::');
  assert.equal(hexToIp('00000000000000000000000001000000'), '::1');
  // 2607:f8b0:4009:81b::200e, the way the kernel prints it.
  assert.equal(hexToIp('B0F80726' + '1B080940' + '00000000' + '0E200000'), '2607:f8b0:4009:81b::200e');
});

const TABLE = `  sl  local_address                         remote_address                        st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode
   0: 00000000000000000000000000000000:97DD 00000000000000000000000000000000:0000 0A 00000000:00000000 00:00000000 00000000  2000        0 6929983 1 0000000000000000 100 0 0 10 0
   1: 0000000000000000FFFF00008901A8C0:C9EC 0000000000000000FFFF0000224FFD8E:01BB 01 00000000:00000000 00:00000000 00000000 10353        0 6929996 1 0000000000000000 100 0 0 10 0
   2: 0000000000000000FFFF00008901A8C0:C9ED 0000000000000000FFFF00000100007F:1F90 01 00000000:00000000 00:00000000 00000000 10353        0 6929997 1 0000000000000000 100 0 0 10 0
   3: 0000000000000000FFFF00008901A8C0:C9EE 0000000000000000FFFF00006401A8C0:0035 01 00000000:00000000 00:00000000 00000000 10353        0 6929998 1 0000000000000000 100 0 0 10 0
   4: 0000000000000000FFFF00008901A8C0:C9EF 0000000000000000FFFF0000224FFD8E:01BB 01 00000000:00000000 00:00000000 00000000 10400        0 6929999 1 0000000000000000 100 0 0 10 0`;

test('a socket table is read row by row with its owner', () => {
  const rows = parseProcNet(TABLE, 'tcp6');
  assert.equal(rows.length, 5);
  assert.deepEqual(
    { ip: rows[1].remoteIp, port: rows[1].remotePort, uid: rows[1].uid, state: rows[1].state, local: rows[1].localIp },
    { ip: '142.253.79.34', port: 443, uid: 10353, state: '01', local: '192.168.1.137' }
  );
});

test('only the app\'s own connections to somewhere are kept, and each is told apart as phone, home network or internet', () => {
  const mine = connectionsOf(parseProcNet(TABLE, 'tcp6'), 10353);
  assert.deepEqual(mine.map((s) => [s.remoteIp, addressKind(s.remoteIp)]), [
    ['142.253.79.34', 'internet'],
    ['127.0.0.1', 'loopback'],
    ['192.168.1.100', 'local-network'],
  ]);
  assert.equal(connectionsOf(parseProcNet(TABLE, 'tcp6'), 10400).length, 1);
  assert.equal(connectionsOf(parseProcNet(TABLE, 'tcp6'), 1).length, 0);
});

test('address kinds', () => {
  assert.equal(addressKind('0.0.0.0'), 'unspecified');
  assert.equal(addressKind('::'), 'unspecified');
  assert.equal(addressKind('::1'), 'loopback');
  assert.equal(addressKind('10.1.2.3'), 'local-network');
  assert.equal(addressKind('172.20.0.5'), 'local-network');
  assert.equal(addressKind('172.40.0.5'), 'internet');
  assert.equal(addressKind('fe80::1'), 'local-network');
  assert.equal(addressKind('8.8.8.8'), 'internet');
  assert.equal(addressKind('2607:f8b0:4009:81b::200e'), 'internet');
});
