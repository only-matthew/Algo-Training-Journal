#include <iostream>
#include <string>
#include <algorithm>
#include <vector>
using namespace std;

int main() {
    int n;
    while (cin >> n && n != 0) {
        string s;
        cin >> s;
        string r = s;
        reverse(r.begin(), r.end());
        string t = r + "#" + s;
        vector<int> nxt(t.size(), 0);
        for (int i = 1; i < (int)t.size(); ++i) {
            int j = nxt[i - 1];
            while (j > 0 && t[i] != t[j]) j = nxt[j - 1];
            if (t[i] == t[j]) ++j;
            nxt[i] = j;
        }
        int L = nxt[t.size() - 1];
        cout << n - L << endl;
    }
    return 0;
}