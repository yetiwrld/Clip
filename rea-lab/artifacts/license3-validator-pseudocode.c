// rea decompile_all
// name: FUN_001011c0
// address: 0x1011c0
// body: available
// range: 0x1011c0-0x1011da inclusive
// range: 0x1011e0-0x101262 inclusive
// non_contiguous: true
// provider: Ghidra 12.1.4 (ghidra)
// analysis_profile: ae80ece8c83379eddabbdf379bbffca5da84c7df7fa7c159f45fa810468f85d9
// limitations: The session serves operations only after Ghidra reports default auto-analysis complete; incomplete analysis does not expose partial results.; The imported Program and temporary project are ephemeral and deleted on close. Annotation operations edit session database metadata; original executable bytes are never written.; Cancelling an active Ghidra request terminates its ephemeral database and discards session annotations. The selected target remains open; the next provider query imports the original artifact again.; Default-space addresses use lowercase 0x-prefixed hexadecimal; other address spaces use <percent-encoded-space>:0x<hex>.; Pseudocode is Ghidra decompiler output, not original source and not text-equivalent to Hopper output.; External functions and functions without an analyzable body return null; other decompiler failures remain explicit.
// pseudocode: provider-specific; not original source


uint FUN_001011c0(char *param_1)

{
  uint uVar1;
  size_t sVar2;
  long lVar3;
  ulong uVar4;
  int local_18;
  char local_14;
  int local_12;
  short local_e;
  
  sVar2 = strlen(param_1);
  if (sVar2 == 0xc) {
    lVar3 = 0;
    uVar4 = 0;
    do {
      *(byte *)((long)&local_18 + lVar3) =
           ((char)uVar4 - ((char)(uVar4 / 0xb) + (char)(uVar4 / 0xb) * '\n')) +
           (param_1[lVar3] ^ 0x5aU);
      lVar3 = lVar3 + 1;
      uVar4 = (ulong)((int)uVar4 + 7);
    } while (lVar3 != 0xc);
    if ((local_18 == 0x190d1835) && (local_14 == '>')) {
      if ((local_12 != 0x351a2822) || (uVar1 = 0, local_e != 0x3412)) {
        uVar1 = 1;
      }
      return uVar1 ^ 1;
    }
  }
  return 0;
}

