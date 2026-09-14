#include<iostream>
#include<algorithm>
using namespace std;
const int MAXN = 1e5 + 5;
int n, m;
int a[MAXN], pre[MAXN];
int P(int x, int obj){
    return pre[x] >= obj;
}
void find(int obj){
    int l = 1, r = n;
    while (l < r){
        int mid = (l + r) / 2;
        if (P(mid, obj)) r = mid;
        else l = mid + 1;
    }
    cout << l << endl;
    return;
}
int main(){
    cin >> n;
    for (int i = 1; i <= n; i++) {cin >> a[i]; pre[i] = pre[i-1] + a[i];}
    cin >> m;
    for (int i = 1; i <= m; i++){
        int objection;
        cin >> objection;
        find(objection);
    }
    return 0;
}