#include<iostream>
#include<algorithm>
using namespace std;
const int MAXN = 5e3 + 5;
struct Farmer{
    int n, p;
};
bool cmp(Farmer a, Farmer b){
    if (a.n != b.n) return a.n < b.n;
    return a.p < b.p;
}
Farmer a[MAXN];
int main(){
    int n, m; cin >> n >> m;
    for (int i = 1; i <= m; i++) cin >> a[i].n >> a[i].p;
    sort(a + 1, a + m + 1, cmp);
    // for (int i = 1; i <= m; i++) cout << a[i].n <<" "<< a[i].p << endl;
    int sum = 0, i = 1, cost = 0;
    while (sum < n){
        if (sum + a[i].p <= n){cost += a[i].n * a[i].p; sum += a[i].p;}
        else {cost += a[i].n * (n - sum); sum = n;}
        i++;
    }
    cout << cost;
    return 0;
}