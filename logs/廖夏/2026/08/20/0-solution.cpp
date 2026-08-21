#include<iostream>
#include<algorithm>
using namespace std;
const int MAXN = 1e6 + 5;
struct Contest{
    int l; int r;
};
bool cmp(Contest a, Contest b){
    return a.r < b.r;
}
Contest con[MAXN];
int main(){
    int n; cin >> n;
    for (int i = 1; i <= n; i++) cin >> con[i].l >> con[i].r;
    sort(con + 1, con + 1 + n, cmp);

    int res = 0, finish = 0;
    for (int i = 1; i <=n; i++){
        if (finish <= con[i].l) finish = con[i].r, res++;
    }
    cout << res;
    return 0;
}