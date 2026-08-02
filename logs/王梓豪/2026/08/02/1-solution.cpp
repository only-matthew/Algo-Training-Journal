#include <bits/stdc++.h>
using namespace std;
double eps=0.0001;
int main() {
    double h,s,v,l,k,n;
    cin>>h>>s>>v>>l>>k>>n;
    double min_=h-k;
    double max_=h;
    double min_t=sqrt(min_/5);
    double max_t=sqrt(max_/5);
    double min_x=min_t*v;
    double max_x=max_t*v;
    int ans=0;
    for(int i=max(int(s-max_x-1),0);i<n;i++)
    {
        if((i + min_x) <= s + l + eps  &&  (i + max_x) >= s - eps)
        {
            ans++;
        }
    }
    cout<<ans<<endl;
    return 0;
}