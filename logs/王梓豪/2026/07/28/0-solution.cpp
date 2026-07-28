#include <bits/stdc++.h>
using namespace std;
int main()
{
    int l;
    int n;
    cin>>l>>n;
    vector<int> a(n);
    for(int i=0;i<n;i++)
    {
        cin>>a[i];
    }int min_=0;
    int max_=0;
    for(int i=0;i<n;i++)
    {
    min_=max(min_,min(a[i],1+l-a[i]));
    max_=max(max_,max(a[i],1+l-a[i]));
    }
    cout<<min_<<" "<<max_<<endl;
}