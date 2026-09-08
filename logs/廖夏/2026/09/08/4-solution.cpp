#include<iostream>
#include<algorithm>
using namespace std;
const int MAXN = 55;
int t, n; 
int a[MAXN];
int main(){
    cin >> t;
    while(t--){
        cin >> n;
        int cnt = 0;
        for (int i = 1; i <= n; i++) {
            cin >> a[i];
            if (!a[i]) cnt++;
        }
        if (!a[1] && !a[n]) cout << 0 << endl;
        else if ((a[1] ^ a[n]) && cnt >= 2) cout << 1 << endl;
        else if (a[1] && a[n] && cnt >= 2) cout << 2 << endl;
        else cout << -1 << endl;
    }
    return 0;
}